import type { Deputy, Expense, Vote, VotePosition, Proposal, AmendmentSnapshot, Amendment } from '../../src/lib/data.ts';

const e = (id: string, documentDate: string, category: string, supplier: string, amountCents: number): Expense =>
  ({ id, date: `${documentDate.slice(0, 7)}-01`, documentDate, category, supplier, amountCents, receiptUrl: null });
const v = (id: string, date: string, title: string, objectType: string, position: VotePosition, result: string, status: string, summary: string, proposalCode: string): Vote =>
  ({ id, date, title, objectType, position, result, status, summary, proposalCode, sourceUrl: null });
const p = (id: string, date: string, title: string, code: string, kind: string, status: string, summary: string): Proposal =>
  ({ id, date, title, code, kind, status, summary, sourceUrl: null });
const s = (date: string, committedCents: number | null, liquidatedCents: number | null, paidCents: number | null): AmendmentSnapshot =>
  ({ date, committedCents, liquidatedCents, paidCents });
const a = (id: string, city: string, purpose: string, beneficiary: string, area: string, indicatedCents: number, snapshots: AmendmentSnapshot[]): Amendment =>
  ({ id, year: 2026, city, purpose, beneficiary, area, indicatedCents, snapshots });

const fixtures: Omit<Deputy, 'sourceUrl' | 'fetchedAt' | 'coverage'>[] = [
  {
    id: 'helena-mascarenhas', name: 'Helena Mascarenhas', fullName: 'Helena de Almeida Mascarenhas', party: 'RENOVAR', partyColor: '#6425C4',
    bio: 'Professora e gestora pública. Atua em educação básica, ciência e acesso digital no interior paulista.',
    status: 'Em exercício', photo: '/images/helena-mascarenhas.webp', state: 'SP', mandate: '2023–2027', sourceLabel: 'Dados fictícios para demonstração',
    expenses: [
      e('hm-e1','2026-04-12','Transporte','Viação Horizonte Paulista',185040),
      e('hm-e2','2026-05-08','Hospedagem','Hotel Ipê das Artes',263900),
      e('hm-e3','2026-06-21','Divulgação','Estúdio Ponte Clara',480000),
      e('hm-e4','2026-07-05','Transporte','Viação Horizonte Paulista',214700),
      e('hm-e5','2026-07-22','Escritório','Papelaria Jardim Solar',93450),
      e('hm-e6','2026-08-16','Hospedagem','Hotel Ipê das Artes',318000),
      e('hm-e7','2026-09-09','Transporte','Mobilidade Vale Azul',172300),
      e('hm-e8','2026-09-24','Divulgação','Estúdio Ponte Clara',395000),
    ],
    votes: [
      v('hm-v1','2026-04-23','Conectividade em escolas públicas','Projeto demonstrativo','Sim','Aprovado','Concluída','Apoio à infraestrutura digital nas escolas.','EXEMPLO-EDU-01'),
      v('hm-v2','2026-06-12','Incentivo à formação docente','Projeto demonstrativo','Sim','Aprovado','Concluída','Formação continuada de docentes da rede pública.','EXEMPLO-EDU-02'),
      v('hm-v3','2026-07-29','Critérios para compras educacionais','Emenda demonstrativa','Abstenção','Rejeitado','Concluída','Regras simuladas para aquisições educacionais.','EXEMPLO-EDU-03'),
      v('hm-v4','2026-08-27','Rede de bibliotecas comunitárias','Projeto demonstrativo','Sim','Aprovado','Concluída','Ampliação do acesso a bibliotecas locais.','EXEMPLO-CULT-01'),
      v('hm-v5','2026-09-18','Avaliação de aprendizagem aberta','Projeto demonstrativo','Não','Aprovado','Concluída','Modelo simulado de avaliação de aprendizagem.','EXEMPLO-EDU-04'),
    ],
    proposals: [
      p('hm-p1','2026-05-14','Laboratórios móveis de ciência','EXEMPLO-PROP-HM-01','Projeto demonstrativo','Em análise','Acesso a experimentos científicos em escolas do interior.'),
      p('hm-p2','2026-07-17','Bibliotecas digitais municipais','EXEMPLO-PROP-HM-02','Projeto demonstrativo','Em análise','Apoio a acervos digitais em pequenos municípios.'),
      p('hm-p3','2026-09-25','Formação para educadores rurais','EXEMPLO-PROP-HM-03','Indicação demonstrativa','Apresentada','Capacitação de docentes da zona rural.'),
    ],
    amendments: [
      a('hm-a1','Campinas','Equipar laboratórios de ciências','Rede Municipal de Ensino de Campinas','Educação',72000000,[s('2026-05-31',null,null,null),s('2026-08-31',51000000,18000000,8000000),s('2026-09-30',51000000,29000000,18000000)]),
      a('hm-a2','Bauru','Ampliar biblioteca comunitária','Fundação Cultural de Bauru','Cultura',38000000,[s('2026-06-30',0,0,0),s('2026-09-30',25000000,0,0)]),
      a('hm-a3','Ribeirão Preto','Instalar acesso digital em escolas','Rede Municipal de Ensino de Ribeirão Preto','Educação',56000000,[s('2026-07-31',null,null,null),s('2026-09-30',null,null,null)]),
    ],
  },
  {
    id: 'daniel-prado', name: 'Daniel Prado', fullName: 'Daniel Augusto Prado', party: 'UNIÃO SP', partyColor: '#EE8242',
    bio: 'Economista com trajetória em gestão municipal. Prioriza mobilidade, infraestrutura urbana e desenvolvimento regional.',
    status: 'Em exercício', photo: '/images/daniel-prado.webp', state: 'SP', mandate: '2023–2027', sourceLabel: 'Dados fictícios para demonstração',
    expenses: [
      e('dp-e1','2026-04-03','Transporte','Expresso Laranjeira',224500),
      e('dp-e2','2026-05-19','Escritório','Papelaria Monte Belo',106800),
      e('dp-e3','2026-06-07','Hospedagem','Hotel Praça Nova',287000),
      e('dp-e4','2026-07-15','Transporte','Expresso Laranjeira',231400),
      e('dp-e5','2026-07-26','Divulgação','Agência Trilho Livre',525000),
      e('dp-e6','2026-08-09','Hospedagem','Hotel Praça Nova',302800),
      e('dp-e7','2026-09-04','Transporte','Mobilidade Vale Azul',198700),
      e('dp-e8','2026-09-20','Escritório','Papelaria Monte Belo',89900),
    ],
    votes: [
      v('dp-v1','2026-04-29','Integração de transporte regional','Projeto demonstrativo','Sim','Aprovado','Concluída','Conexão simulada entre modais regionais.','EXEMPLO-MOB-01'),
      v('dp-v2','2026-06-18','Cadastro de obras municipais','Projeto demonstrativo','Sim','Aprovado','Concluída','Transparência de obras de infraestrutura.','EXEMPLO-INF-01'),
      v('dp-v3','2026-07-22','Regra para manutenção viária','Emenda demonstrativa','Não','Rejeitado','Concluída','Manutenção de vias urbanas.','EXEMPLO-INF-02'),
      v('dp-v4','2026-08-13','Corredores de ônibus metropolitanos','Projeto demonstrativo','Sim','Aprovado','Concluída','Planejamento de corredores de ônibus.','EXEMPLO-MOB-02'),
      v('dp-v5','2026-09-23','Parcerias para terminais regionais','Projeto demonstrativo','Obstrução','Adiado','Concluída','Modelo fictício de parceria em terminais.','EXEMPLO-MOB-03'),
    ],
    proposals: [
      p('dp-p1','2026-04-16','Plano de calçadas acessíveis','EXEMPLO-PROP-DP-01','Projeto demonstrativo','Em análise','Diretrizes para acessibilidade de calçadas.'),
      p('dp-p2','2026-07-02','Dados abertos de obras públicas','EXEMPLO-PROP-DP-02','Projeto demonstrativo','Em análise','Painel de obras públicas com informações padronizadas.'),
      p('dp-p3','2026-09-11','Rotas seguras para bicicletas','EXEMPLO-PROP-DP-03','Indicação demonstrativa','Apresentada','Estudo de rotas cicláveis regionais.'),
    ],
    amendments: [
      a('dp-a1','Santos','Reformar terminal de ônibus','Autarquia Municipal de Transporte de Santos','Mobilidade',85000000,[s('2026-05-31',null,null,null),s('2026-09-30',65000000,35000000,22000000)]),
      a('dp-a2','Sorocaba','Implantar travessias acessíveis','Secretaria Municipal de Mobilidade de Sorocaba','Mobilidade',42000000,[s('2026-06-30',0,0,0),s('2026-09-30',31000000,12000000,0)]),
      a('dp-a3','Taubaté','Recuperar ponte municipal','Prefeitura Municipal de Taubaté','Infraestrutura',61000000,[s('2026-07-31',null,null,null),s('2026-09-30',null,null,null)]),
    ],
  },
  {
    id: 'lucia-bittencourt', name: 'Lúcia Bittencourt', fullName: 'Lúcia Maria Bittencourt', party: 'FRENTE', partyColor: '#D14D8E',
    bio: 'Assistente social e ex-conselheira municipal. Trabalha com saúde preventiva, assistência social e direitos das mulheres.',
    status: 'Em exercício', photo: '/images/lucia-bittencourt.webp', state: 'SP', mandate: '2023–2027', sourceLabel: 'Dados fictícios para demonstração',
    expenses: [
      e('lb-e1','2026-04-11','Hospedagem','Pousada Manacá Urbano',242000),
      e('lb-e2','2026-05-22','Transporte','Viação Rota Serena',174800),
      e('lb-e3','2026-06-04','Divulgação','Ateliê Linha Viva',455000),
      e('lb-e4','2026-07-19','Hospedagem','Pousada Manacá Urbano',268000),
      e('lb-e5','2026-07-30','Escritório','Papelaria Flor do Vale',98700),
      e('lb-e6','2026-08-20','Transporte','Viação Rota Serena',221700),
      e('lb-e7','2026-09-14','Divulgação','Ateliê Linha Viva',410000),
      e('lb-e8','2026-09-27','Transporte','Mobilidade Vale Azul',186400),
    ],
    votes: [
      v('lb-v1','2026-04-20','Atendimento preventivo em bairros','Projeto demonstrativo','Sim','Aprovado','Concluída','Ações locais de prevenção em saúde.','EXEMPLO-SAU-01'),
      v('lb-v2','2026-06-03','Rede de acolhimento comunitário','Projeto demonstrativo','Sim','Aprovado','Concluída','Fortalecimento de pontos de acolhimento.','EXEMPLO-SOC-01'),
      v('lb-v3','2026-07-21','Capacitação de agentes de saúde','Emenda demonstrativa','Sim','Aprovado','Concluída','Formação de equipes de atenção primária.','EXEMPLO-SAU-02'),
      v('lb-v4','2026-08-24','Diretrizes de atendimento social','Projeto demonstrativo','Abstenção','Aprovado','Concluída','Critérios simulados de atendimento social.','EXEMPLO-SOC-02'),
      v('lb-v5','2026-09-16','Proteção de mulheres em áreas rurais','Projeto demonstrativo','Sim','Aprovado','Concluída','Rede de serviços para mulheres rurais.','EXEMPLO-SOC-03'),
    ],
    proposals: [
      p('lb-p1','2026-05-07','Unidades móveis de atenção básica','EXEMPLO-PROP-LB-01','Projeto demonstrativo','Em análise','Atendimento itinerante de saúde básica.'),
      p('lb-p2','2026-08-06','Acolhimento integrado às famílias','EXEMPLO-PROP-LB-02','Projeto demonstrativo','Em análise','Integração de serviços sociais locais.'),
      p('lb-p3','2026-09-29','Formação de lideranças comunitárias','EXEMPLO-PROP-LB-03','Indicação demonstrativa','Apresentada','Apoio a lideranças comunitárias.'),
    ],
    amendments: [
      a('lb-a1','Guarulhos','Ampliar unidade de saúde da família','Rede Municipal de Saúde de Guarulhos','Saúde',68000000,[s('2026-05-31',null,null,null),s('2026-09-30',48000000,26000000,12000000)]),
      a('lb-a2','São José dos Campos','Equipar centro de acolhimento','Secretaria Municipal de Assistência Social','Assistência social',45000000,[s('2026-06-30',0,0,0),s('2026-09-30',25000000,0,0)]),
      a('lb-a3','São Paulo','Apoiar saúde preventiva nos bairros','Rede Municipal de Saúde de São Paulo','Saúde',53000000,[s('2026-07-31',null,null,null),s('2026-09-30',null,null,null)]),
    ],
  },
  {
    id: 'roberto-salles', name: 'Roberto Salles', fullName: 'Roberto Henrique Salles', party: 'CONSERVAR', partyColor: '#2B6487',
    bio: 'Advogado e ex-vereador. Concentra o mandato em segurança pública, defesa civil e gestão de riscos.',
    status: 'Em exercício', photo: '/images/roberto-salles.webp', state: 'SP', mandate: '2023–2027', sourceLabel: 'Dados fictícios para demonstração',
    expenses: [
      e('rs-e1','2026-04-25','Transporte','Expresso Pedra Alta',216500),
      e('rs-e2','2026-05-10','Divulgação','Oficina Mapa Claro',470000),
      e('rs-e3','2026-06-15','Hospedagem','Hotel Alameda Azul',296000),
      e('rs-e4','2026-07-07','Escritório','Papelaria Campo Verde',84600),
      e('rs-e5','2026-07-24','Transporte','Expresso Pedra Alta',238900),
      e('rs-e6','2026-08-11','Hospedagem','Hotel Alameda Azul',312000),
      e('rs-e7','2026-09-03','Divulgação','Oficina Mapa Claro',428000),
      e('rs-e8','2026-09-21','Transporte','Mobilidade Vale Azul',189500),
    ],
    votes: [
      v('rs-v1','2026-04-30','Plano de defesa civil municipal','Projeto demonstrativo','Sim','Aprovado','Concluída','Planejamento municipal de resposta a desastres.','EXEMPLO-SEG-01'),
      v('rs-v2','2026-06-25','Treinamento de brigadas locais','Projeto demonstrativo','Sim','Aprovado','Concluída','Capacitação de brigadas comunitárias.','EXEMPLO-SEG-02'),
      v('rs-v3','2026-07-31','Mapa público de áreas de risco','Emenda demonstrativa','Não','Rejeitado','Concluída','Publicação de mapas municipais de risco.','EXEMPLO-SEG-03'),
      v('rs-v4','2026-08-19','Protocolos de alerta antecipado','Projeto demonstrativo','Sim','Aprovado','Concluída','Alertas para eventos climáticos intensos.','EXEMPLO-SEG-04'),
      v('rs-v5','2026-09-26','Cadastro de abrigos emergenciais','Projeto demonstrativo','Não informado','Adiado','Sem registro de posição','A posição individual não foi informada no conjunto fictício.','EXEMPLO-SEG-05'),
    ],
    proposals: [
      p('rs-p1','2026-05-29','Rota de evacuação municipal','EXEMPLO-PROP-RS-01','Projeto demonstrativo','Em análise','Sinalização de rotas em áreas de risco.'),
      p('rs-p2','2026-07-09','Rede de alertas de enchente','EXEMPLO-PROP-RS-02','Projeto demonstrativo','Em análise','Avisos locais de risco de enchente.'),
      p('rs-p3','2026-09-12','Centros regionais de resposta','EXEMPLO-PROP-RS-03','Indicação demonstrativa','Apresentada','Coordenação de resposta regional.'),
    ],
    amendments: [
      a('rs-a1','Franca','Equipar brigada de defesa civil','Defesa Civil Municipal de Franca','Defesa civil',59000000,[s('2026-05-31',null,null,null),s('2026-09-30',43000000,21000000,11000000)]),
      a('rs-a2','Atibaia','Instalar sistema de alerta','Defesa Civil Municipal de Atibaia','Defesa civil',33000000,[s('2026-06-30',0,0,0),s('2026-09-30',19000000,0,0)]),
      a('rs-a3','Piracicaba','Reformar abrigo emergencial','Prefeitura Municipal de Piracicaba','Infraestrutura',47000000,[s('2026-07-31',null,null,null),s('2026-09-30',null,null,null)]),
    ],
  },
  {
    id: 'marina-ferraz', name: 'Marina Ferraz', fullName: 'Marina Costa Ferraz', party: 'PROGRESSO', partyColor: '#2C9B77',
    bio: 'Engenheira ambiental. Defende saneamento, adaptação climática e desenvolvimento sustentável.',
    status: 'Em exercício', photo: '/images/marina-ferraz.webp', state: 'SP', mandate: '2023–2027', sourceLabel: 'Dados fictícios para demonstração',
    expenses: [
      e('mf-e1','2026-04-17','Transporte','Viação Sabiá Verde',196200),
      e('mf-e2','2026-05-26','Hospedagem','Hotel Rio Sereno',276000),
      e('mf-e3','2026-06-10','Escritório','Papelaria Raiz Nova',102400),
      e('mf-e4','2026-07-13','Divulgação','Estúdio Horizonte Vivo',502000),
      e('mf-e5','2026-07-28','Transporte','Viação Sabiá Verde',211900),
      e('mf-e6','2026-08-18','Hospedagem','Hotel Rio Sereno',294000),
      e('mf-e7','2026-09-08','Transporte','Mobilidade Vale Azul',184600),
      e('mf-e8','2026-09-22','Divulgação','Estúdio Horizonte Vivo',387000),
    ],
    votes: [
      v('mf-v1','2026-04-27','Monitoramento de qualidade da água','Projeto demonstrativo','Sim','Aprovado','Concluída','Acesso público a indicadores de água.','EXEMPLO-AMB-01'),
      v('mf-v2','2026-06-16','Reúso de água em prédios públicos','Projeto demonstrativo','Sim','Aprovado','Concluída','Práticas simuladas de reúso de água.','EXEMPLO-AMB-02'),
      v('mf-v3','2026-07-23','Incentivo a telhados verdes','Emenda demonstrativa','Abstenção','Rejeitado','Concluída','Incentivo simulado à infraestrutura verde.','EXEMPLO-AMB-03'),
      v('mf-v4','2026-08-21','Plano local de adaptação climática','Projeto demonstrativo','Sim','Aprovado','Concluída','Planejamento de adaptação municipal.','EXEMPLO-AMB-04'),
      v('mf-v5','2026-09-17','Indicadores de coleta seletiva','Projeto demonstrativo','Sim','Aprovado','Concluída','Dados municipais de resíduos recicláveis.','EXEMPLO-AMB-05'),
    ],
    proposals: [
      p('mf-p1','2026-05-12','Áreas verdes de bairro','EXEMPLO-PROP-MF-01','Projeto demonstrativo','Em análise','Pequenas áreas verdes urbanas.'),
      p('mf-p2','2026-07-06','Escolas para adaptação climática','EXEMPLO-PROP-MF-02','Projeto demonstrativo','Em análise','Formação para escolas em áreas de risco climático.'),
      p('mf-p3','2026-09-28','Saneamento em pequenos municípios','EXEMPLO-PROP-MF-03','Indicação demonstrativa','Apresentada','Apoio técnico para saneamento local.'),
    ],
    amendments: [
      a('mf-a1','Jundiaí','Ampliar coleta seletiva','Serviço Municipal de Limpeza de Jundiaí','Meio ambiente',64000000,[s('2026-05-31',null,null,null),s('2026-09-30',47000000,23000000,13000000)]),
      a('mf-a2','São Carlos','Recuperar nascentes urbanas','Secretaria Municipal de Meio Ambiente','Meio ambiente',39000000,[s('2026-06-30',0,0,0),s('2026-09-30',26000000,9000000,0)]),
      a('mf-a3','Limeira','Instalar medidores de água','Serviço Municipal de Água de Limeira','Saneamento',58000000,[s('2026-07-31',null,null,null),s('2026-09-30',null,null,null)]),
    ],
  },
  {
    id: 'caio-andrade', name: 'Caio Andrade', fullName: 'Caio Ribeiro Andrade', party: 'NOVO RUMO', partyColor: '#DBA83C',
    bio: 'Empreendedor social. Trabalha com empreendedorismo local, inclusão produtiva e simplificação de serviços.',
    status: 'Em exercício', photo: '/images/caio-andrade.webp', state: 'SP', mandate: '2023–2027', sourceLabel: 'Dados fictícios para demonstração',
    expenses: [
      e('ca-e1','2026-04-09','Divulgação','Agência Janela Aberta',445000),
      e('ca-e2','2026-05-15','Transporte','Expresso Estação Sol',202800),
      e('ca-e3','2026-06-23','Hospedagem','Hotel Bosque Central',258000),
      e('ca-e4','2026-07-11','Escritório','Papelaria Estação Nova',91500),
      e('ca-e5','2026-07-27','Transporte','Expresso Estação Sol',221600),
      e('ca-e6','2026-08-14','Divulgação','Agência Janela Aberta',497000),
      e('ca-e7','2026-09-07','Hospedagem','Hotel Bosque Central',281000),
      e('ca-e8','2026-09-19','Transporte','Mobilidade Vale Azul',177800),
    ],
    votes: [
      v('ca-v1','2026-04-22','Atendimento digital ao empreendedor','Projeto demonstrativo','Sim','Aprovado','Concluída','Serviços digitais para pequenos negócios.','EXEMPLO-EMP-01'),
      v('ca-v2','2026-06-11','Capacitação para cooperativas','Projeto demonstrativo','Sim','Aprovado','Concluída','Formação de cooperativas locais.','EXEMPLO-EMP-02'),
      v('ca-v3','2026-07-20','Cadastro único de licenças locais','Emenda demonstrativa','Não','Rejeitado','Concluída','Cadastro simulado de licenças municipais.','EXEMPLO-EMP-03'),
      v('ca-v4','2026-08-26','Microcrédito em comunidades','Projeto demonstrativo','Sim','Aprovado','Concluída','Acesso simulado a pequenos financiamentos.','EXEMPLO-EMP-04'),
      v('ca-v5','2026-09-24','Formação técnica de jovens','Projeto demonstrativo','Sim','Aprovado','Concluída','Trilhas locais de formação profissional.','EXEMPLO-EMP-05'),
    ],
    proposals: [
      p('ca-p1','2026-05-05','Balcão digital para pequenos negócios','EXEMPLO-PROP-CA-01','Projeto demonstrativo','Em análise','Serviços digitais concentrados para empreendedores.'),
      p('ca-p2','2026-07-16','Feiras de economia local','EXEMPLO-PROP-CA-02','Projeto demonstrativo','Em análise','Apoio a feiras de produtores locais.'),
      p('ca-p3','2026-09-30','Oficinas de primeiro emprego','EXEMPLO-PROP-CA-03','Indicação demonstrativa','Apresentada','Oficinas profissionalizantes para jovens.'),
    ],
    amendments: [
      a('ca-a1','Osasco','Equipar centro de formação profissional','Centro Municipal de Formação de Osasco','Trabalho',57000000,[s('2026-05-31',null,null,null),s('2026-09-30',39000000,19000000,9000000)]),
      a('ca-a2','Mogi das Cruzes','Apoiar feira de produtores locais','Secretaria Municipal de Desenvolvimento','Economia local',36000000,[s('2026-06-30',0,0,0),s('2026-09-30',22000000,0,0)]),
      a('ca-a3','Americana','Instalar balcão de serviços digitais','Prefeitura Municipal de Americana','Serviços públicos',49000000,[s('2026-07-31',null,null,null),s('2026-09-30',null,null,null)]),
    ],
  },
];

const coverage = {
  status: 'unavailable' as const,
  since: '2026-04-01',
  until: '2026-09-30',
  fetchedAt: null,
  sourceUrl: '',
  message: 'Dados fictícios para demonstração.',
};

export const deputies: Deputy[] = fixtures.map((deputy) => ({
  ...deputy,
  sourceUrl: '',
  fetchedAt: '',
  coverage: { expenses: coverage, votes: coverage, proposals: coverage, amendments: coverage },
}));
