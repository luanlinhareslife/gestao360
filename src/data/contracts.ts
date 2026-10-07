export type ObligationSeverity = 'CRÍTICO' | 'ALTO' | 'MÉDIO' | 'BAIXO';
export type ObligationStatus = 'PENDENTE' | 'EM ACOMPANHAMENTO' | 'CONCLUÍDA' | 'VERIFICAÇÃO URGENTE';

export type Contract = {
  id: string;
  number: string;
  process: string;
  agency: string;
  contractor: string;
  cnpj: string;
  object: string;
  value: number;
  signedAt: string;
  executionDays: number;
  validity: string;
  guaranteePercent: number;
  guaranteeValue: number;
  status: string;
};

export type Obligation = {
  id: string;
  contractId: string;
  title: string;
  trigger: string;
  deadline: string;
  status: ObligationStatus;
  severity: ObligationSeverity;
  source: string;
  action: string;
};

export const contracts: Contract[] = [
  {
    id: 'contract-89-2026',
    number: '89/2026',
    process: '1197/SEMPRE/2026',
    agency: 'Prefeitura Municipal de Presidente Médici/RO · Secretaria Municipal de Planejamento',
    contractor: 'MM SERVICOS ESPECIALIZADOS LTDA',
    cnpj: '26.473.197/0001-70',
    object: 'Construção de ponte de madeira de lei na Linha 106, km 7,76, sobre o Rio Riachuelo, com 25,00 m de extensão e área de 125,00 m².',
    value: 530400,
    signedAt: '07/10/2026',
    executionDays: 150,
    validity: '12 meses contados da publicação no PNCP',
    guaranteePercent: 5,
    guaranteeValue: 26520,
    status: 'Assinado · iniciar checklist',
  },
];

export const obligations: Obligation[] = [
  {
    id: '89-garantia',
    contractId: 'contract-89-2026',
    title: 'Conferir garantia da contratação de 5% (R$ 26.520,00)',
    trigger: 'Antes da assinatura / conferência imediata',
    deadline: 'Antes da assinatura',
    status: 'VERIFICAÇÃO URGENTE',
    severity: 'CRÍTICO',
    source: 'Cláusulas 11.1 e 10.2',
    action: 'Confirmar a modalidade escolhida e arquivar a comprovação. Se for seguro-garantia, conferir a apólice; se for caução ou fiança, registrar o instrumento correspondente.',
  },
  {
    id: '89-art-projeto',
    contractId: 'contract-89-2026',
    title: 'Providenciar ART do projeto executivo',
    trigger: 'Antes do início dos serviços',
    deadline: 'Antes da Ordem de Serviço/início',
    status: 'PENDENTE',
    severity: 'ALTO',
    source: 'Cláusula 9.14',
    action: 'Registrar a ART e vincular o documento ao contrato.',
  },
  {
    id: '89-art-execucao',
    contractId: 'contract-89-2026',
    title: 'Providenciar ART da execução',
    trigger: 'Antes do início dos serviços',
    deadline: 'Antes da Ordem de Serviço/início',
    status: 'PENDENTE',
    severity: 'ALTO',
    source: 'Cláusula 9.14',
    action: 'Registrar a ART de execução e vincular o documento ao contrato e à obra.',
  },
  {
    id: '89-os',
    contractId: 'contract-89-2026',
    title: 'Obter Ordem de Serviço para autorizar o início',
    trigger: 'Após conferência das pendências críticas',
    deadline: 'Antes do início',
    status: 'PENDENTE',
    severity: 'ALTO',
    source: 'Cláusulas 8.3 e 3.1',
    action: 'Cadastrar a OS, data efetiva de início e responsável pela fiscalização.',
  },
  {
    id: '89-preposto',
    contractId: 'contract-89-2026',
    title: 'Designar e registrar preposto da contratada',
    trigger: 'Início da gestão contratual',
    deadline: 'Antes ou no início da execução',
    status: 'PENDENTE',
    severity: 'MÉDIO',
    source: 'Cláusula 9.3',
    action: 'Cadastrar o preposto e manter seus dados vinculados ao contrato.',
  },
  {
    id: '89-cronograma',
    contractId: 'contract-89-2026',
    title: 'Conferir cronograma físico-financeiro e marco inicial dos 150 dias',
    trigger: 'Antes do início',
    deadline: 'Na emissão da OS',
    status: 'PENDENTE',
    severity: 'ALTO',
    source: 'Cláusulas 2.1, 3.2 e 3.7.3',
    action: 'Registrar o marco inicial e gerar a data-limite da execução a partir da OS.',
  },
  {
    id: '89-habilitacao',
    contractId: 'contract-89-2026',
    title: 'Manter habilitação e certidões durante a execução',
    trigger: 'Monitoramento contínuo',
    deadline: 'Durante toda a execução',
    status: 'EM ACOMPANHAMENTO',
    severity: 'ALTO',
    source: 'Cláusulas 9.10 e 3.9.2',
    action: 'Controlar validade das certidões e gerar alertas antes do vencimento.',
  },
  {
    id: '89-medicao',
    contractId: 'contract-89-2026',
    title: 'Preparar pacote de medição mensal',
    trigger: 'Fim de cada etapa/período de medição',
    deadline: 'Mensal / conforme execução',
    status: 'EM ACOMPANHAMENTO',
    severity: 'MÉDIO',
    source: 'Cláusula 6.1',
    action: 'Conferir diário de obra, planilha, memória de cálculo, relatório fotográfico, ART e certificados exigidos.',
  },
  {
    id: '89-reajuste',
    contractId: 'contract-89-2026',
    title: 'Controlar reajuste anual pelo INCC',
    trigger: 'Após 12 meses da data-base prevista no contrato',
    deadline: 'A partir de 20/07/2027, se aplicável',
    status: 'EM ACOMPANHAMENTO',
    severity: 'MÉDIO',
    source: 'Cláusulas 7.2 e 7.3',
    action: 'Criar marco de análise do reajuste pelo INCC e verificar se há direito e documentação necessária.',
  },
  {
    id: '89-garantia-renovacao',
    contractId: 'contract-89-2026',
    title: 'Controlar manutenção e renovação da garantia em caso de prorrogação',
    trigger: 'Prorrogação ou alteração do prazo',
    deadline: 'Sempre que houver extensão',
    status: 'EM ACOMPANHAMENTO',
    severity: 'MÉDIO',
    source: 'Cláusula 11.2 / 10.2',
    action: 'Antes de formalizar a prorrogação, verificar se a garantia permanece válida e registrar a renovação.',
  },
  {
    id: '89-warranty-5y',
    contractId: 'contract-89-2026',
    title: 'Programar controle da garantia contratual de 5 anos',
    trigger: 'Recebimento definitivo',
    deadline: 'Após o recebimento definitivo',
    status: 'EM ACOMPANHAMENTO',
    severity: 'BAIXO',
    source: 'Cláusula 10.1',
    action: 'Criar marco de pós-obra para acompanhar a responsabilidade contratual pelo período de garantia.',
  },
];

export function analyzePostSignature(contractId: string): Obligation[] {
  return obligations.filter(item => item.contractId === contractId);
}
