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
    executionDays?: number;
    guaranteePercent?: number;
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

  const text = normalize(pageTexts.join('\n'));
  const number = firstMatch(text, [
    /Contrato\s*(?:Administrativo\s*)?n[º°.]?\s*([0-9]+\/[0-9]{4})/i,
    /Contrato\s*n[º°.]?\s*([0-9]+\/[0-9]{4})/i,
  ]);
  const process = firstMatch(text, [
    /Processo(?:\s*Administrativo)?\s*(?:n[º°.]?\s*)?([0-9.\/-]+\/[A-Z]+\/[0-9]{4})/i,
    /Processo\s*(?:n[º°.]?\s*)?([0-9.\/-]+)/i,
  ]);
  const valueText = firstMatch(text, [
    /valor(?:\s+total)?(?:\s+do\s+contrato)?\s*(?:é|:)?\s*R\$\s*([0-9.]+,[0-9]{2})/i,
    /R\$\s*([0-9.]+,[0-9]{2})\s*(?:\(.*?\))?\s*[,;]?\s*(?:valor|total)/i,
  ]);
  const signedAt = firstMatch(text, [
    /(?:assinado|assinatura|celebrado)[^\n]{0,80}?(\d{2}\/\d{2}\/\d{4})/i,
  ]);
  const executionText = firstMatch(text, [
    /(?:prazo de execução|execução)[^\n]{0,80}?(\d{1,4})\s*dias/i,
  ]);
  const guaranteeText = firstMatch(text, [
    /garantia[^\n]{0,100}?(\d{1,2}(?:[.,]\d+)?)\s*%/i,
  ]);

  const obligations = detectObligations(text);

  return {
    fileName: file.name,
    pages: document.numPages,
    text,
    detected: {
      number,
      process,
      value: parseMoney(valueText),
      signedAt,
      executionDays: executionText ? Number(executionText) : undefined,
      guaranteePercent: guaranteeText ? Number(guaranteeText.replace(',', '.')) : undefined,
    },
    obligations,
    clauses: splitClauses(text),
  };
}
