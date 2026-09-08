# Matriz de plataformas — escopo anunciado da versão candidata

**Decisão F0-04:** a versão candidata **não anuncia as sete plataformas como autonomia real**. Escopo anunciado: **assistida/manual** com adaptadores genéricos de observação. Capacidades obrigatórias de autonomia real permanecem **não certificadas**.

| Plataforma | Login/sessão | Busca/leitura | Formulários/anexos | Envio/confirmação | Acompanhamento | Evidência R e versão |
|---|---|---|---|---|---|---|
| Gupy | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |
| InfoJobs | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |
| PandaPé | assistida/manual | indisponível (convite) | assistida/manual | assistida/manual | assistida/manual | busca pública não aplicável; destino por convite |
| LinkedIn | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |
| Catho | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |
| Vagas.com | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |
| Sólides | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |

PandaPé não oferece busca pública confiável; o adaptador diferencia página vazia de convite ausente. Destino externo exige outro adaptador e pausa a capacidade de envio da origem.

Nenhuma capacidade acima está certificada para autonomia real. Código genérico disponível não altera esse estado.

## Página de busca por plataforma

Cada plataforma navega para a própria página de busca. A origem da URL, em ordem: `searchUrl` da plataforma na campanha, chave `<PLATAFORMA>_URL` do `.env` (ver `config/plataformas.json`) e, por último, o padrão do adaptador. Um valor com `{q}` recebe a consulta montada a partir dos filtros; sem o marcador, a URL é usada como a própria página de busca.

Seleção vazia na tela inicial usa as plataformas habilitadas na campanha. A busca nunca cai para a lista completa de sete plataformas por omissão.

## Mecanismo com evidência de navegador (B)

O mecanismo de busca, leitura, preenchimento com fatos confirmados, revisão, aprovação humana, envio, confirmação e evidência foi observado em site controlado com Chromium real (`e2e/production-journey.test.mjs`, `e2e/scenario-matrix.test.mjs`, `e2e/controlled-browser.test.mjs`). Isso é evidência do **mecanismo**, não de compatibilidade com qualquer plataforma da tabela: as linhas acima só mudam com evidência R na plataforma correspondente e na versão observada.
