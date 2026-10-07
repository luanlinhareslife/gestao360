import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

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
  obligations: Array<{
    id: string;
    title: string;
    trigger: string;
    deadline: string;
    status: 'PENDENTE';
    severity: 'CRÍTICO' | 'ALTO' | 'MÉDIO';
    source: string;
    action: string;
  }>;
};

function normalize(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
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

function detectObligations(text: string) {
  const rules = [
    {
      key: 'art',
      terms: ['art da execução', 'art de execução', 'art do projeto', 'anotação de responsabilidade técnica', 'art'],
      title: 'Conferir ARTs exigidas pelo contrato',
      trigger: 'Antes do início dos serviços',
      deadline: 'Antes da Ordem de Serviço/início',
      severity: 'CRÍTICO' as const,
      action: 'Identificar no texto contratual quais ARTs são exigidas, conferir registro, profissional responsável e vinculação ao contrato/obra.',
      source: 'Texto do contrato · ocorrência de ART',
    },
    {
      key: 'garantia',
      terms: ['garantia contratual', 'seguro-garantia', 'caução', 'fiança bancária'],
      title: 'Conferir garantia contratual e modalidade',
      trigger: 'Antes da assinatura ou conforme cláusula de garantia',
      deadline: 'Conforme prazo previsto no contrato',
      severity: 'CRÍTICO' as const,
      action: 'Identificar percentual/valor da garantia e conferir a modalidade escolhida e sua validade.',
      source: 'Texto do contrato · ocorrência de garantia',
    },
    {
      key: 'ordem-servico',
      terms: ['ordem de serviço', 'ordem de início'],
      title: 'Controlar Ordem de Serviço e marco inicial',
      trigger: 'Antes do início',
      deadline: 'Na emissão da Ordem de Serviço',
      severity: 'ALTO' as const,
      action: 'Registrar a Ordem de Serviço e usar sua data como marco para os prazos de execução quando o contrato assim estabelecer.',
      source: 'Texto do contrato · ocorrência de Ordem de Serviço',
    },
    {
      key: 'preposto',
      terms: ['preposto'],
      title: 'Cadastrar preposto da contratada',
      trigger: 'Início da gestão contratual',
      deadline: 'Antes ou no início da execução',
      severity: 'MÉDIO' as const,
      action: 'Registrar o preposto e seus dados de contato quando exigido pelo contrato.',
      source: 'Texto do contrato · ocorrência de preposto',
    },
    {
      key: 'medicao',
      terms: ['medição', 'memória de cálculo', 'relatório fotográfico', 'diário de obra'],
      title: 'Preparar documentação de medição',
      trigger: 'Durante a execução / períodos de medição',
      deadline: 'Conforme cronograma e cláusula de medição',
      severity: 'MÉDIO' as const,
      action: 'Controlar os documentos exigidos para cada medição e impedir fechamento sem os anexos obrigatórios identificados.',
      source: 'Texto do contrato · ocorrência de medição',
    },
    {
      key: 'habilitacao',
      terms: ['manter as condições de habilitação', 'regularidade fiscal', 'certidões', 'habilitação'],
      title: 'Monitorar habilitação e certidões',
      trigger: 'Durante toda a execução',
      deadline: 'Contínuo',
      severity: 'ALTO' as const,
      action: 'Cadastrar os documentos encontrados e gerar alertas antes dos vencimentos.',
      source: 'Texto do contrato · ocorrência de habilitação/regularidade',
    },
    {
      key: 'reajuste',
      terms: ['reajuste', 'índice', 'incc'],
      title: 'Criar controle de reajuste',
      trigger: 'Após a data-base prevista',
      deadline: 'Conforme periodicidade e data-base do contrato',
      severity: 'MÉDIO' as const,
      action: 'Identificar índice, data-base e periodicidade e criar o marco de análise do reajuste.',
      source: 'Texto do contrato · ocorrência de reajuste',
    },
    {
      key: 'recebimento',
      terms: ['recebimento definitivo', 'recebimento provisório'],
      title: 'Controlar recebimento da obra/objeto',
      trigger: 'Conclusão da execução',
      deadline: 'Após conclusão, conforme contrato',
      severity: 'MÉDIO' as const,
      action: 'Registrar recebimento provisório/definitivo e vincular os documentos de encerramento.',
      source: 'Texto do contrato · ocorrência de recebimento',
    },
    {
      key: 'garantia-obra',
      terms: ['cinco anos', '5 (cinco) anos', 'garantia de 5 anos', 'garantia de cinco anos'],
      title: 'Programar garantia pós-recebimento',
      trigger: 'Recebimento definitivo',
      deadline: 'Período de garantia indicado no contrato',
      severity: 'MÉDIO' as const,
      action: 'Criar marco pós-obra para acompanhamento da garantia contratual pelo período identificado.',
      source: 'Texto do contrato · ocorrência de garantia pós-obra',
    },
  ];

  const lower = text.toLocaleLowerCase('pt-BR');
  return rules
    .filter(rule => rule.terms.some(term => lower.includes(term)))
    .map((rule, index) => ({
      id: `pdf-${rule.key}-${index}`,
      title: rule.title,
      trigger: rule.trigger,
      deadline: rule.deadline,
      status: 'PENDENTE' as const,
      severity: rule.severity,
      source: rule.source,
      action: rule.action,
    }));
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
    obligations: detectObligations(text),
  };
}
