import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export type ContractIntelligence = {
  clause?: string;
  actor?: string;
  action?: string;
  document?: string;
  responsible?: string;
  trigger?: string;
  deadline?: string;
  condition?: string;
  evidence?: string;
  confidence: 'ALTA' | 'MÉDIA' | 'BAIXA';
};

export type ContractObligation = {
  id: string;
  title: string;
  trigger: string;
  deadline: string;
  status: 'PENDENTE';
  severity: 'CRÍTICO' | 'ALTO' | 'MÉDIO';
  source: string;
  action: string;
  intelligence: ContractIntelligence;
};

export type ExtractedContract = {
  fileName: string;
  pages: number;
  text: string;
  detected: {
    number?: string;
    process?: string;
    value?: number;
    signedAt?: string;
    orderServiceNumber?: string;
    orderServiceIssuedAt?: string;
    orderServiceMunicipalSignedAt?: string;
    orderServiceCompanySignedAt?: string;
    orderServiceSignedAt?: string;
    serviceStartDate?: string;
    serviceStartRule?: string;
    serviceStartEvidence?: string;
    executionDays?: number;
    guaranteePercent?: number;
    guaranteeValue?: number;
    validityDays?: number;
    administrativeProcess?: string;
    seiProcess?: string;
    contractingAgency?: string;
    contractor?: string;
    contractorCnpj?: string;
    object?: string;
    validityRule?: string;
    executionRule?: string;
    fieldEvidence?: Record<string, string>;
    fieldConfidence?: Record<string, 'ALTA' | 'MÉDIA' | 'BAIXA'>;
  };
  obligations: ContractObligation[];
  clauses: Array<{
    id: string;
    heading: string;
    text: string;
    obligations: ContractObligation[];
  }>;
};

function normalize(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function parseMoney(value?: string) {
  if (!value) return undefined;
  const clean = value.replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.');
  const number = Number(clean);
  return Number.isFinite(number) ? number : undefined;
}

function cleanSnippet(value: string, max = 420) {
  const clean = normalize(value);
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

function extractEvidence(text: string, terms: string[]) {
  const lower = text.toLocaleLowerCase('pt-BR');
  let index = -1;
  for (const term of terms) {
    const found = lower.indexOf(term.toLocaleLowerCase('pt-BR'));
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  if (index < 0) return undefined;
  const start = Math.max(0, index - 180);
  const end = Math.min(text.length, index + 360);
  return cleanSnippet(text.slice(start, end));
}

function inferClauseHeading(evidence?: string) {
  if (!evidence) return 'Cláusula identificada no texto';
  const match = evidence.match(/(?:CLÁUSULA|CLAUSULA)\s+[^\n:.]{1,100}/i);
  return match?.[0]?.trim() ?? 'Cláusula identificada no texto';
}

type Rule = {
  key: string;
  terms: string[];
  title: string;
  trigger: string;
  deadline: string;
  severity: ContractObligation['severity'];
  action: string;
  actor: string;
  document: string;
  responsible: string;
  condition: string;
};

const rules: Rule[] = [
  {
    key: 'art',
    terms: ['art da execução', 'art de execução', 'art do projeto', 'anotação de responsabilidade técnica'],
    title: 'Conferir ARTs exigidas pelo contrato',
    trigger: 'Antes do início dos serviços',
    deadline: 'Antes da Ordem de Serviço/início',
    severity: 'CRÍTICO',
    action: 'Identificar quais ARTs são exigidas, conferir registro, profissional responsável e vinculação ao contrato/obra.',
    actor: 'Contratada / responsável técnico',
    document: 'ART de projeto e/ou execução',
    responsible: 'Engenharia / responsável técnico',
    condition: 'Não liberar o início sem conferir as ARTs exigidas.',
  },
  {
    key: 'garantia',
    terms: ['garantia contratual', 'seguro-garantia', 'caução', 'fiança bancária'],
    title: 'Conferir garantia contratual e modalidade',
    trigger: 'Assinatura do contrato / condição de início',
    deadline: 'Conforme prazo previsto na cláusula de garantia',
    severity: 'CRÍTICO',
    action: 'Identificar percentual/valor, modalidade, vigência e condição de apresentação da garantia.',
    actor: 'Contratada',
    document: 'Seguro-garantia, caução ou fiança',
    responsible: 'Administrativo / contratos',
    condition: 'Garantia válida e compatível com o contrato antes do marco exigido.',
  },
  {
    key: 'ordem-servico',
    terms: ['ordem de serviço', 'ordem de início'],
    title: 'Controlar Ordem de Serviço e marco inicial',
    trigger: 'Antes do início',
    deadline: 'Na emissão da Ordem de Serviço',
    severity: 'ALTO',
    action: 'Registrar a Ordem de Serviço e usar sua data como marco dos prazos quando o contrato assim estabelecer.',
    actor: 'Contratante / fiscalização',
    document: 'Ordem de Serviço',
    responsible: 'Gestão contratual / fiscalização',
    condition: 'Usar a data efetiva da OS para calcular o prazo de execução.',
  },
  {
    key: 'preposto',
    terms: ['preposto'],
    title: 'Cadastrar preposto da contratada',
    trigger: 'Início da gestão contratual',
    deadline: 'Antes ou no início da execução',
    severity: 'MÉDIO',
    action: 'Registrar o preposto e seus dados de contato quando exigido pelo contrato.',
    actor: 'Contratada',
    document: 'Termo/registro de preposto',
    responsible: 'Administrativo / contratos',
    condition: 'Preposto identificado e contato disponível para a fiscalização.',
  },
  {
    key: 'medicao',
    terms: ['medição', 'memória de cálculo', 'relatório fotográfico', 'diário de obra'],
    title: 'Preparar documentação de medição',
    trigger: 'Durante a execução / períodos de medição',
    deadline: 'Conforme cronograma e cláusula de medição',
    severity: 'MÉDIO',
    action: 'Controlar os documentos exigidos para cada medição e impedir fechamento sem os anexos obrigatórios identificados.',
    actor: 'Contratada / fiscalização',
    document: 'Medição, memória de cálculo, fotos e diário',
    responsible: 'Engenharia / medição',
    condition: 'Pacote documental completo antes do protocolo da medição.',
  },
  {
    key: 'habilitacao',
    terms: ['manter as condições de habilitação', 'regularidade fiscal', 'certidões', 'habilitação'],
    title: 'Monitorar habilitação e certidões',
    trigger: 'Durante toda a execução',
    deadline: 'Contínuo',
    severity: 'ALTO',
    action: 'Cadastrar documentos encontrados e gerar alertas antes dos vencimentos.',
    actor: 'Contratada',
    document: 'Certidões e comprovantes de regularidade',
    responsible: 'Administrativo / contratos',
    condition: 'Condições de habilitação mantidas durante a execução.',
  },
  {
    key: 'reajuste',
    terms: ['reajuste', 'índice', 'incc'],
    title: 'Criar controle de reajuste',
    trigger: 'Após a data-base prevista',
    deadline: 'Conforme periodicidade e data-base do contrato',
    severity: 'MÉDIO',
    action: 'Identificar índice, data-base e periodicidade e criar o marco de análise do reajuste.',
    actor: 'Contratada / contratante',
    document: 'Memória de cálculo / pedido de reajuste',
    responsible: 'Contratos / financeiro',
    condition: 'Verificar elegibilidade somente após o período mínimo previsto.',
  },
  {
    key: 'recebimento',
    terms: ['recebimento definitivo', 'recebimento provisório'],
    title: 'Controlar recebimento da obra/objeto',
    trigger: 'Conclusão da execução',
    deadline: 'Após conclusão, conforme contrato',
    severity: 'MÉDIO',
    action: 'Registrar recebimento provisório/definitivo e vincular os documentos de encerramento.',
    actor: 'Contratante / fiscalização',
    document: 'Termo de recebimento',
    responsible: 'Fiscalização / gestão contratual',
    condition: 'Recebimento somente após conferência do objeto e documentação.',
  },
  {
    key: 'garantia-obra',
    terms: ['cinco anos', '5 (cinco) anos', 'garantia de 5 anos', 'garantia de cinco anos'],
    title: 'Programar garantia pós-recebimento',
    trigger: 'Recebimento definitivo',
    deadline: 'Período de garantia indicado no contrato',
    severity: 'MÉDIO',
    action: 'Criar marco pós-obra para acompanhamento da garantia pelo período identificado.',
    actor: 'Contratada',
    document: 'Termo de recebimento / registro de garantia',
    responsible: 'Gestão contratual',
    condition: 'Manter histórico para eventual acionamento durante o período de garantia.',
  },
];

function detectRule(text: string, rule: Rule, index: number): ContractObligation | null {
  const lower = text.toLocaleLowerCase('pt-BR');
  if (!rule.terms.some(term => lower.includes(term.toLocaleLowerCase('pt-BR')))) return null;

  const evidence = extractEvidence(text, rule.terms);
  const clause = inferClauseHeading(evidence);
  const confidence: ContractIntelligence['confidence'] = evidence ? 'ALTA' : 'MÉDIA';

  return {
    id: `pdf-${rule.key}-${index}`,
    title: rule.title,
    trigger: rule.trigger,
    deadline: rule.deadline,
    status: 'PENDENTE',
    severity: rule.severity,
    source: `${clause} · evidência localizada no PDF`,
    action: rule.action,
    intelligence: {
      clause,
      actor: rule.actor,
      action: rule.action,
      document: rule.document,
      responsible: rule.responsible,
      trigger: rule.trigger,
      deadline: rule.deadline,
      condition: rule.condition,
      evidence,
      confidence,
    },
  };
}

function detectObligations(text: string) {
  return rules
    .map((rule, index) => detectRule(text, rule, index))
    .filter((item): item is ContractObligation => item !== null);
}

function splitClauses(text: string) {
  const matches = [...text.matchAll(/(?:CLÁUSULA|CLAUSULA)\s+([^\n:.]{1,120})/gi)];
  if (!matches.length) return [];

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const next = matches[index + 1]?.index ?? text.length;
    const heading = `CLÁUSULA ${match[1].trim()}`;
    const clauseText = cleanSnippet(text.slice(start, next), 1600);
    const obligations = detectObligations(clauseText);
    return {
      id: `clause-${index + 1}`,
      heading,
      text: clauseText,
      obligations,
    };
  });
}


function parseBrazilianDate(value?: string) {
  if (!value) return undefined;
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return undefined;
  return `${year}-${month}-${day}`;
}

function extractLabeledValue(text: string, labels: RegExp[], max = 500) {
  for (const label of labels) {
    const match = label.exec(text);
    if (!match || match.index === undefined) continue;
    const sample = text.slice(match.index, match.index + max);
    const value = sample.match(/(?:^|[:\-]\s*)([^;\n]{3,220})/);
    if (value?.[1]) return cleanSnippet(value[1], 220);
  }
  return undefined;
}

function extractContractParties(text: string) {
  const head = text.slice(0, 18000);
  const agency = firstMatch(head, [
    /(?:CONTRATANTE|órgão\s+contratante)\s*[:\-]?\s*([^\n]{3,180})/i,
    /(Departamento Estadual de Estradas de Rodagem e Transportes|DER\s*\/\s*RO)/i,
  ]);
  const contractor = firstMatch(head, [
    /(?:CONTRATADA|CONTRATADO|empresa\s+contratada)\s*[:\-]?\s*([^\n]{3,180})/i,
    /(MM\s+SERVIÇOS\s+ESPECIALIZADOS\s+LTDA\.?)/i,
  ]);
  const cnpjMatches = [...head.matchAll(/(?:CNPJ\s*(?:n[º°.]?\s*)?[:\-]?\s*)?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/gi)];
  const contractorCnpj = cnpjMatches.find(match => {
    const before = head.slice(Math.max(0, (match.index ?? 0) - 180), match.index);
    return /contratada|contratado|empresa/i.test(before);
  })?.[1];
  return {
    contractingAgency: agency?.replace(/^.*?(Departamento Estadual de Estradas de Rodagem e Transportes|DER\s*\/\s*RO)/i, '$1').trim(),
    contractor: contractor?.trim(),
    contractorCnpj,
  };
}

function extractContractObject(text: string) {
  const head = text.slice(0, 22000);
  const patterns = [
    /(?:CLÁUSULA\s+PRIMEIRA|CLÁUSULA\s+1ª|DO\s+OBJETO)[\s\S]{0,180}?objeto(?:\s+do\s+contrato)?\s*[:\-]\s*([\s\S]{30,900}?)(?=\s*(?:CLÁUSULA\s+(?:SEGUNDA|2ª)|\b2\s*\.|\b1\.2\b))/i,
    /objeto(?:\s+do\s+contrato)?\s*[:\-]\s*([\s\S]{30,700}?)(?=\s*(?:CLÁUSULA|\b1\.2\b|\b2\.))/i,
  ];
  return firstMatch(head, patterns)?.replace(/\s+/g, ' ').trim();
}

function extractDuration(text: string, kind: 'validity' | 'execution') {
  const head = text.slice(0, 30000);
  const patterns = kind === 'execution'
    ? [
        /(?:prazo\s+de\s+execução|execução\s+dos\s+serviços)[\s\S]{0,180}?(\d{1,4})\s*\(?(?:\w+\)?\s*)?dias/i,
        /executad[oa]s?[\s\S]{0,140}?(\d{1,4})\s*dias/i,
      ]
    : [
        /(?:prazo\s+de\s+vigência|vigência\s+do\s+contrato|vigência)[\s\S]{0,180}?(\d{1,4})\s*\(?(?:\w+\)?\s*)?dias/i,
      ];
  for (const pattern of patterns) {
    const match = pattern.exec(head);
    if (match?.[1]) {
      const context = cleanSnippet(head.slice(Math.max(0, (match.index ?? 0) - 100), (match.index ?? 0) + match[0].length + 180), 360);
      return { days: Number(match[1]), evidence: context };
    }
  }
  return { days: undefined, evidence: undefined };
}

function extractProcessReferences(text: string) {
  const opening = text.slice(0, 14000);
  const administrativeProcess = firstMatch(opening, [
    /processo\s+administrativo\s*(?:n[º°.]?\s*)?([0-9.\/-]+)/i,
    /processo\s*(?:n[º°.]?\s*)?([0-9]{4,}(?:\.[0-9]+)*\/[0-9]{4}-[0-9]+)/i,
  ]);
  const seiProcess = firstMatch(text, [
    /(?:SEI|processo\s+SEI)[^0-9]{0,50}([0-9]{4}\.[0-9]{6}\/[0-9]{4}-[0-9]{2})/i,
  ]);
  return { administrativeProcess, seiProcess };
}

function extractOrderServiceDates(text: string) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!/ordem\s+de\s+servi[cç]o|ordem\s+de\s+in[ií]cio/i.test(flat)) return {};

  const orderServiceNumber = firstMatch(flat, [
    /ordem\s+de\s+servi[cç]o\s*n[º°o.]?\s*0*(\d+\s*\/\s*\d{4})/i,
    /ordem\s+de\s+servi[cç]o\s*(\d+\s+de\s+\d{2}\/\d{2}\/\d{4})/i,
  ])?.replace(/\s+/g, '');

  const issuedText = firstMatch(flat, [
    /ordem\s+de\s+servi[cç]o\s*\d+\s+de\s+(\d{2}\/\d{2}\/\d{4})/i,
    /(?:data\s+de\s+emiss[aã]o|emitida\s+em)\s*(?:desta\s+)?(?:ordem\s+de\s+servi[cç]o)?\s*(?:em)?\s*(\d{2}\/\d{2}\/\d{4})/i,
  ]);

  const municipalSignature = flat.match(/assinado\s+eletronicamente\s+por\s+.{1,180}?(?:prefeito|prefeita|munic[ií]pio|secret[aá]rio|servidor).{0,100}?em\s+(\d{2}\/\d{2}\/\d{4})\s+[àa]s\s+(\d{2}:\d{2})/i)
    ?? flat.match(/assinado\s+eletronicamente\s+por\s+([^,]{2,100}),?\s*em\s+(\d{2}\/\d{2}\/\d{4})\s+[àa]s\s+(\d{2}:\d{2})/i);
  const companySignature = flat.match(/assinado\s+eletronicamente\s+por\s+.{1,180}?(?:representante|empresa|contratada|ltda).{0,100}?em\s+(\d{2}\/\d{2}\/\d{4})\s+[àa]s\s+(\d{2}:\d{2})/i);

  const issuedAt = parseBrazilianDate(issuedText);
  const municipalSignedAt = parseBrazilianDate(municipalSignature?.[1] ?? municipalSignature?.[2]);
  const companySignedAt = parseBrazilianDate(companySignature?.[1]);
  const startFromIssue = /a\s+partir\s+da\s+data\s+de\s+emiss[aã]o\s+desta\s+ordem\s+de\s+servi[cç]o/i.test(flat);
  const explicitStartText = firstMatch(flat, [
    /(?:in[ií]cio\s+dos\s+servi[cç]os?|iniciar\s+os\s+servi[cç]os?)[^.;]{0,140}?(?:em|no\s+dia|a\s+partir\s+de|para\s+o\s+dia)\s*(\d{2}\/\d{2}\/\d{4})/i,
  ]);
  const directStart = parseBrazilianDate(explicitStartText);
  const serviceStartDate = directStart ?? (startFromIssue ? issuedAt : undefined);
  const serviceStartRule = directStart
    ? 'Data de início expressamente indicada na Ordem de Serviço'
    : startFromIssue && issuedAt
      ? 'Início autorizado a partir da data de emissão da Ordem de Serviço'
      : undefined;
  const evidence = startFromIssue
    ? 'A contratada fica autorizada a iniciar os serviços a partir da data de emissão desta Ordem de Serviço.'
    : explicitStartText
      ? cleanSnippet(explicitStartText)
      : issuedText
        ? cleanSnippet(issuedText)
        : undefined;

  return {
    orderServiceNumber,
    orderServiceIssuedAt: issuedAt,
    orderServiceMunicipalSignedAt: municipalSignedAt,
    orderServiceCompanySignedAt: companySignedAt,
    orderServiceSignedAt: issuedAt ?? municipalSignedAt,
    serviceStartDate,
    serviceStartRule,
    serviceStartEvidence: evidence,
  };
}

export async function extractContractFromPdf(file: File): Promise<ExtractedContract> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Selecione um arquivo PDF.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map(item => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ');
    pageTexts.push(pageText);
  }

  const text = normalize(pageTexts.join('\\n'));
  const number = firstMatch(text.slice(0, 16000), [
    /Contrato\\s*(?:Administrativo\\s*)?n[º°.]?\\s*([0-9]+\\/[0-9]{4})/i,
    /Contrato\\s*n[º°.]?\\s*([0-9]+\\/[0-9]{4})/i,
  ]);
  const processRefs = extractProcessReferences(text);
  const parties = extractContractParties(text);
  const object = extractContractObject(text);
  const valueText = firstMatch(text.slice(0, 24000), [
    /valor\\s+(?:global\\s+)?(?:do\\s+presente\\s+contrato|total\\s+do\\s+contrato|do\\s+contrato)[^R$]{0,100}R$\\s*([0-9.]+,[0-9]{2})/i,
    /valor(?:\\s+total)?(?:\\s+do\\s+contrato)?\\s*(?:é|:)?\\s*R$\\s*([0-9.]+,[0-9]{2})/i,
  ]);
  const signedAt = firstMatch(text.slice(0, 26000), [
    /(?:data\\s+da\\s+assinatura|assinado\\s+em|celebrado\\s+em)[^0-9]{0,60}(\\d{2}\\/\\d{2}\\/\\d{4})/i,
    /(?:Porto Velho|Ji-Paraná)[^0-9]{0,80}(\\d{2}\\/\\d{2}\\/\\d{4})/i,
  ]);
  const execution = extractDuration(text, 'execution');
  const validity = extractDuration(text, 'validity');
  const guaranteeText = firstMatch(text.slice(0, 30000), [
    /garantia(?:\\s+contratual)?[\\s\\S]{0,180}?(\\d{1,2}(?:[.,]\\d+)?)\\s*%/i,
    /\\b(\\d{1,2}(?:[.,]\\d+)?)\\s*%[\\s\\S]{0,100}garantia/i,
  ]);
  const value = parseMoney(valueText);
  const guaranteePercent = guaranteeText ? Number(guaranteeText.replace(',', '.')) : undefined;
  const fieldEvidence: Record<string, string> = {};
  const fieldConfidence: Record<string, 'ALTA' | 'MÉDIA' | 'BAIXA'> = {};
  const registerEvidence = (key: string, evidence?: string, confidence: 'ALTA' | 'MÉDIA' | 'BAIXA' = 'ALTA') => {
    if (evidence) { fieldEvidence[key] = cleanSnippet(evidence, 500); fieldConfidence[key] = confidence; }
  };
  registerEvidence('number', number ? extractEvidence(text.slice(0, 16000), ['Contrato']) : undefined);
  registerEvidence('administrativeProcess', processRefs.administrativeProcess ? extractEvidence(text.slice(0, 14000), ['processo administrativo']) : undefined);
  registerEvidence('seiProcess', processRefs.seiProcess ? extractEvidence(text, ['SEI']) : undefined);
  registerEvidence('object', object);
  registerEvidence('value', valueText ? extractEvidence(text.slice(0, 24000), ['valor do presente contrato', 'valor total do contrato', 'valor do contrato']) : undefined);
  registerEvidence('signedAt', signedAt ? extractEvidence(text.slice(0, 26000), ['data da assinatura', 'assinado em', 'celebrado em']) : undefined);
  registerEvidence('execution', execution.evidence);
  registerEvidence('validity', validity.evidence);
  registerEvidence('guarantee', guaranteeText ? extractEvidence(text.slice(0, 30000), ['garantia contratual', 'garantia']) : undefined);
  registerEvidence('contractor', parties.contractor);
  registerEvidence('contractingAgency', parties.contractingAgency);

  const obligations = detectObligations(text);
  const orderServiceDates = extractOrderServiceDates(text);

  return {
    fileName: file.name,
    pages: document.numPages,
    text,
    detected: {
      number,
      process,
      value: parseMoney(valueText),
      signedAt,
      ...orderServiceDates,
      executionDays: executionText ? Number(executionText) : undefined,
      guaranteePercent: guaranteeText ? Number(guaranteeText.replace(',', '.')) : undefined,
    },
    obligations,
    clauses: splitClauses(text),
  };
}
