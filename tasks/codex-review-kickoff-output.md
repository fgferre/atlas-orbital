**Veredito**

Meu veredito é: **quase, mas ainda não blindado**. O kickoff já corrige bem o erro principal do rollback anterior, porque deixa claro que `phase-gaia-sky.md` é mapa, que a fonte do Gaia Sky é o território, e que o review do Codex precisa receber o shader real inline. Isso provavelmente evita o erro mais grosseiro de “implementar pela prose do plano”.

O que ainda falta é endurecer 4 pontos que um assistant em `auto mode` pode explorar sem perceber: **transliteração verbatim disfarçada de adaptação, “adaptação” sem critério operacional, scope cut que corta o coração do efeito, e validação visual ainda subjetiva**. Se esses pontos forem fechados, o kickoff fica bem mais apto a produzir paridade visual real sem repetir o rollback.

**Alta**

1. **Falta um guardrail operacional contra cópia/transliteração verbatim.**  
   Referência: linhas **79-84**, com apoio em **24-28** e **96-103**.  
   Problema: “rendered pixels, not source code” e “No literal copy-paste” são corretos, mas ainda permitem o loophole de abrir o shader do Gaia Sky lado a lado e fazer uma transliteração linha por linha para TS/GLSL local. Isso resolve o medo de “invenção”, mas abre exatamente o risco oposto que você chamou de boundary de licença.  
   Mudança proposta: adicionar uma frase logo após a linha 82, algo como: **“Implemente a partir de notas próprias, não por transliteração lado a lado. Se qualquer bloco não trivial do Gaia Sky sobreviver quase intacto na implementação Atlas (por exemplo, mais de 3 linhas contíguas não-comentadas de GLSL/Java ou o corpo de uma função reconhecível), pare e reescreva a partir do entendimento.”**  
   Isso não precisa ser “cerimônia de licença”; é só um tripwire técnico.

2. **“Adaptar” versus “inventar” ainda está no feeling.**  
   Referência: linhas **96-103**, **168-178** e **187-188**.  
   Problema: R1 manda ler tudo e resumir, mas não define **quais razões tornam um desvio legítimo**. Hoje um assistant ainda pode escrever: “Atlas will re-apply as Z because W”, onde `W` é só preferência pessoal, conveniência, ou uma simplificação não validada. Isso volta a abrir a porta para invenção com outra embalagem.  
   Mudança proposta: inserir no checklist ou em R1 uma mini-regra de adaptação: **cada desvio do Gaia Sky precisa ser classificado como `stack/API mismatch`, `pipeline/render-space mismatch`, `tier/performance gate`, ou `a11y/reduced-motion gate`**. Qualquer desvio por “achei melhor”, “mais simples”, “mais barato” sem prova visual vira invenção e bloqueia a onda.

3. **R7 permite scope cut demais e pode legitimar corte do próprio efeito-fonte.**  
   Referência: linhas **155-160**, com impacto direto em **168-178** e **184-201**.  
   Problema: do jeito que está, R7 protege honestidade de commit, mas não impede um assistant de dizer algo como: “scope reduzido, não precisei ler/portar o resto do shader” ou “shippei só a parte central do efeito”. Isso é honesto no commit message e mesmo assim continua sendo o erro do rollback.  
   Mudança proposta: acrescentar uma frase em R7: **“Scope cuts só podem remover superfície adjacente (UI, persistência, spec de Playwright, baselines extras, docs). Nunca podem remover leitura integral da fonte, tracing de shaders adjacentes, host wiring de uniforms, nem subcomportamentos visuais centrais do efeito escolhido. Se isso for cortado, a onda é adiada, não parcialmente enviada.”**

4. **O gate de “visual 1:1” ainda está subjetivo demais.**  
   Referência: linhas **85-86**, **127-130** e **190-191**.  
   Problema: “passes the user's eye test” e “report any perceptible mismatch” são direções boas, mas não fecham o loop. Um assistant ainda pode declarar “side-by-side verificado” com desvio grande de raio, falloff, composição, cor, ghost spacing ou animação.  
   Mudança proposta: endurecer R2 ou o passo 5 com um **matched-shot protocol**: mesma cena/corpo, mesma câmera/FoV, mesmo tier/preset, mesma resolução/DPR, mesma exposição/post chain, e para efeitos animados o mesmo instante ou janela temporal. Também vale explicitar: **se houver delta perceptível em `shape`, `radius/falloff`, `color/chromatic split`, `animation timing`, ou `compositing order`, o status não é “1:1”; é “paridade parcial / mismatch listado”.**

**Média**

5. **Há conflito entre “wait for approval” e o `auto mode`; esse passo tende a ser pulado.**  
   Referência: linhas **102-103** versus **242-244**.  
   Problema: em fresh context, um assistant pode facilmente classificar a aprovação do parágrafo de entendimento como “routine approval” e seguir direto para o código por causa do auto mode. Isso é exatamente o ponto onde a sessão anterior saiu do trilho.  
   Mudança proposta: adicionar no fim de R1: **“Essa aprovação não é rotina e não é dispensada pelo auto mode. Não escrever código antes dela.”**

6. **O passo mais provável de ser pulado é o Step 2, porque não gera artefato verificável.**  
   Referência: linhas **164-178** e **185-188**, com efeito cascata em **194-196**.  
   Problema: “Run pre-onda checklist” é a etapa mais vulnerável sob pressão de auto mode, porque ela pode ser “cumprida mentalmente” sem deixar rastro. A combinação que mais reproduz o rollback é pular **Step 2 + Step 5 + Step 8/R5**: sem checklist materializado, sem comparação visual disciplinada, e sem review do Codex contra a fonte real.  
   Mudança proposta: transformar o Step 2 em gate explícito: **“Cole no chat a checklist preenchida + lista de arquivos Gaia lidos + parágrafo de entendimento antes do Step 3. Sem esse artefato, a implementação é proibida.”** Isso é pequeno, mas muda bastante a robustez do processo.

7. **O kickoff já diz que o plano é mapa, mas só manda alinhar o plano depois do ship.**  
   Referência: linhas **15-16**, **52-54**, **177**, **198** e **217-224**.  
   Problema: há um bom sinal de que o plano pode estar errado, especialmente em θ.2 e θ.6. Mas o protocolo só exige atualizar `phase-gaia-sky.md` no passo 10, depois do código. Um assistant apressado ainda pode ficar psicologicamente preso às prescrições do plano durante a implementação e só “corrigir a narrativa” depois.  
   Mudança proposta: adicionar uma linha no checklist ou antes do Step 3: **“Se a fonte contradizer `tasks/phase-gaia-sky.md §5 θ.N`, registre a divergência antes de codar e trate a fonte como autoridade imediata.”** Assim o plano deixa de ser âncora errada no momento crítico.

**Baixa**

8. **O template da primeira mensagem pode induzir bluff factual em ambiente bloqueado.**  
   Referência: linhas **250-263**.  
   Problema: o texto-modelo assume que clone, HEAD limpo e preview já aconteceram. Se qualquer item de §0 falhar, um assistant pode repetir a fórmula mesmo assim para manter o fluxo. Isso não cria invenção visual diretamente, mas enfraquece a confiabilidade do kickoff como documento único de contexto.  
   Mudança proposta: acrescentar uma linha final: **“Só envie a mensagem-modelo se cada afirmação for literalmente verdadeira; se algum item de §0 falhar, reporte o bloqueio em vez de recitar o template.”**

**Fechamento**

O documento **já captura bem** o conhecimento tácito mais importante do usuário: “não quero cerimônia de licença, quero entender e reaplicar”, e “o shader real vale mais que a prose do plano”. O que ainda não está suficientemente explícito é o meio-termo operacional entre esses dois polos: **nem copiar, nem inventar**.

Se eu tivesse que endurecer só 3 pontos cirúrgicos, eu faria estes:

1. Adicionar o **tripwire anti-transliteração/verbatim**.
2. Declarar que **approval do source-summary não é dispensada pelo auto mode**.
3. Exigir **matched-shot protocol + lista de mismatches** antes de chamar algo de “1:1”.

Com esses três ajustes, o kickoff sobe bastante de “bom direcionamento” para “processo realmente à prova do rollback de 2026-04-20”.
