# HANDOFF — Redesign de iluminação do Atlas Orbital

> Contexto destilado de uma conversa de pesquisa + auditoria (2026-07-28/29).
> A implementação começou em OUTRA conversa/worktree — este documento não sabe
> o que ela já cobriu. Antes de agir sobre qualquer item, verifique no código
> se já foi feito. Referências file:line são do estado pré-implementação
> (branch `claude/tiled-streaming-corrections-hevjwt`, commit `611c424`).

---

## 1. Decisões de produto já tomadas (pelo usuário — não reabrir)

1. O app é **educacional**. Observabilidade do lado escuro é requisito, não luxo.
   Citação do usuário: "não estamos com o melhor padrão de iluminação no nosso
   engine, ponto final."
2. Deve existir **controle de realce** dirigindo múltiplas técnicas da indústria
   de uma vez (referência explícita do usuário: SpaceEngine).
3. **Assistido por padrão** — justificado por precedente triplo: o próprio Atlas
   já entrega `scaleMode: "didactic"` como default divulgado por pílula âmbar;
   o NASA Eyes usa "shadow" (assistido) como default; a indústria inteira tem
   piso ambiente não-zero por padrão.

## 2. Fatos de código verificados (auditoria com 8 agentes, 2026-07-29)

### Estado da iluminação

- `SceneLighting.tsx:27` — única `pointLight` em [0,0,0] com `decay={0}`.
  Mercúrio e Sedna recebem irradiância idêntica.
- `visualPresets.ts:94,108,122,136,150` — `ambientIntensity: 0.0` nos 5 presets.
  O comentário (:35-37) justifica como **paridade com Gaia Sky** — regra que o
  AGENTS.md explicitamente aposentou. Não é decisão física, é herança.
- `useVisualPresetLerp.ts:160-165` — escreve ambient/sun/smartSun intensity
  **por frame**. ARMADILHA: qualquer piso ambiente setado fora dos lerp targets
  é silenciosamente sobrescrito. Compor em `resolveLerpRefTargets`.
- SmartSunLight é **inerte**: `SmartSunLight.tsx:74` põe a luz no layer 1, a
  câmera nunca sai do layer 0 (comentário em `SceneLighting.tsx:29-38`).
- **5 controles mortos** no DisplayPanel (não 4): Ambient Light × (:322),
  Shadow Light × (:350), Env Reflections × (:364), Shadow Map Size (:194),
  Env Map Resolution (:206). Sun Brightness × (:336) está VIVO.
  Testes que pinam os campos: `visualPresetOverrides.test.ts:123-167`,
  `resolver.test.ts:66-69` — deletar junto (AGENTS.md §6 permite).
  RESSALVA da auditoria de UX: **não deletar o multiplicador de ambiente** —
  reaproveitá-lo como o controle de exibição que o plano precisa (§4).

### Patch de fotometria de regolito

- `regolithPhotometryPatch.ts:77-93` — multiplica `reflectedLight.directDiffuse`
  (soma de TODAS as luzes diretas) por `1.3333/max(lsMu0+lsMu, 1e-4)`, com
  geometria derivada só do Sol (assume sol na origem via `viewMatrix[3].xyz`,
  zero uniforms — mover o Sol quebra silenciosamente).
- Bug **latente** (hoje só há uma luz). Qualquer segunda luz direta seria
  amplificada até ~13.333× (clampado, não "ilimitado") perto do terminador.
- O piso ambiente NÃO é afetado — ambiente acumula em `indirectDiffuse`, que o
  patch deixa intocado. **Piso ambiente pode entrar antes do fix do patch.**
- 7 corpos com `airlessRegolith: true` (`celestialBodies.ts:91,730,776,811,846,881,1181`):
  mercury, moon, ganymede, callisto, io, europa, enceladus.
- 4 corpos airless **estruturalmente inalcançáveis** (haumea, vesta, pallas,
  hygiea): renderizam via `PlanetModel.tsx`, sem onBeforeCompile
  (documentado em `regolithPhotometryPatch.ts:60-67`).
- `regolithPhotometry.test.ts` pina a forma do GLSL por **regex**
  (`reflectedLight.directDiffuse *= <número> /`) e re-deriva 4/3 por quadratura.
  Qualquer reescrita do patch precisa atualizar esse teste junto.

### Pipeline / tone mapping

- Composer roda `HalfFloatType` (`PostProcessingPipeline.tsx:171`) — HDR real.
- **Tone mapping default é "none"** nos 4 presets gráficos
  (`resolver.ts:132,151,170,189`). AgX/ACES são selecionáveis mas o pass fica
  desmontado por padrão (`PostProcessingPipeline.tsx:48-53,187-191`).
- Contrato de Bloom: `luminanceThreshold=1.0` assume superfícies ≤ 1.0
  (`PostProcessingPipeline.tsx:125-131`). CONSEQUÊNCIA: ganho > 1 sem operador
  de tone mapping = clip branco + halo de bloom nos corpos "ajudados".
- `gl.toneMappingExposure` é **no-op** sob o contrato NoToneMapping
  (documentado em `DisplayPanel.tsx:14-19`) — pré-exposição tem que ser
  multiplicador de luz, estilo Filament.
- Materiais: `sunEmissive`/`nightLightIntensity`/`surfaceFillLight` são deps de
  useMemo (`usePlanetMaterials.ts:642-660`), `ringEmissive` num memo separado
  (:716) — escalar por frame recria/descarta material. Intensidade de LUZ por
  frame é segura (padrão já shipado no lerp hook).
- Atmosfera: ShaderMaterial próprio **ignora luzes de cena**, com exposures
  hardcoded (`atmscatteringSnippet.ts:76-77`). Nuvens: COLOR blend
  (GL_ONE / GL_ONE_MINUS_SRC_COLOR) **não é invariante a escala de luminância**
  — src > 1 gera fator negativo (artefatos subtrativos).

### Escala e efemérides

- `store.ts:272` — `scaleMode: "didactic"` default. Compressão log com cap 3200
  (`astrophysics.ts:53`), saturação ≈ 323 UA (:64).
- **NUNCA derivar irradiância de distância de mundo.** Usar UA heliocêntrica de
  efeméride como escalar de CPU — `resolveHeliocentricDistanceAU` já existe com
  cache de 1s em `useVisualPresetLerp.ts:105-108` (padrão pronto para copiar).

### e2e

- Existe **UMA** baseline de pixel: `boot-frozen-chromium-win32.png`
  (boot.spec.ts:106-112, tolerância 1%), sem disco de planeta resolvível —
  mudanças de shading em luas NÃO quebram baseline nenhuma.
- A pílula existente ocupa ~0,92% do frame; o gate é 1% — uma **segunda pílula
  visível no boot estoura o gate** (regen intencional, regra em boot.spec.ts:22-26).
- Baseline é win32-only — não valida no Linux. Screenshot no tier ultra trava
  o Chromium (`postprocessing.spec.ts:79-91`, abandonado).
- `ScalePill.tsx` — padrão de divulgação: âmbar quando desvia, esmeralda quando
  fiel, `data-testid="scale-pill"`. Nova divulgação deve seguir a mesma semântica.

## 3. Pesquisa de indústria (fontes primárias, verificadas)

- **NASA Eyes on the Solar System** (bundle de produção lido diretamente):
  três modos — Flood / Natural / **Shadow (DEFAULT)**. Shadow = headlight de
  câmera a 15% + piso ambiente 0.005; Natural (realista) é opt-in; modo
  quiosque/museu força Flood. Tours guiados trocam o modo de luz por slide.
  Sem HDR, sem exposição, sem inverse-square, Lambert estilizado. Também tem:
  penumbra analítica com raio finito do sol + avermelhamento Rayleigh na borda
  da sombra (precedente direto da Onda 3).
- **OpenSpace** (AMNH, o mais científico da categoria): ambiente **0.05 default**
  em todo globo; Oren-Nayar com roughness por corpo; exposição HDR como controle
  **separado** (default 3.7); switch "fully illuminated" exposto a iniciantes.
- **Stellarium**: piso 0.02 **hard-coded** em todo corpo; reclamação de
  realismo fechada como wontfix (issue #669); earthshine implementado como
  ambiente da Lua: `(1-fase)² × 0.15`, gated por luminância do céu.
- **SpaceEngine**: F7 tem ambiente E exposição como sliders separados;
  `DayAmbient` por planeta ("fake ambient", recomendado para corpos sem
  atmosfera); Shift+V desliga brilho real.
- **Universe Sandbox** (Update 35): ligou inverse-square real MANTENDO
  "Space Goggles" (filtro composto) ligado por padrão.
- **Conclusão**: o Atlas com ambiente 0.0 é o outlier da indústria. E ninguém
  divulga o assist — divulgação por posição seria diferencial de honestidade.

## 4. O plano corrigido (pós-auditoria)

### Onda 1

1. Apagar os 5 controles mortos (+testes que os pinam), **exceto** o
   multiplicador de ambiente — reaproveitar como controle de exibição.
2. **Reescrever o patch de regolito como wrapper per-light de `RE_Direct`**
   (escala o delta de cada chamada pelo mu0 da PRÓPRIA luz — limitado a 4/3
   por construção), ANTES de qualquer segunda fonte. Atualizar o teste de
   quadratura para a forma per-light.
3. Piso ambiente componível via lerp targets (imune ao bug do patch).
4. **DOIS controles**, não um:
   - _Exibição_ (por dispositivo, sem pílula — não altera alegação de conteúdo):
     exposição, piso ambiente de visualização, black-lift **pós-tonemap**.
   - _Assist de conteúdo_ (com pílula): ganho de corpos sub-expostos,
     multiplicador de night lights, (futuro) boost de planetshine.
5. Posições nomeadas pela **consequência visível** (padrão ScalePill):
   "Brilho real / Brilho assistido / Realçado". **NÃO usar "Científico"
   enquanto `decay=0` existir** — seria alegação de proveniência falsa.
6. Decisão de tone mapping POR posição: ganho > 1 exige operador montado
   (AgX) com grades re-tunados, ou cap de ganho abaixo do threshold do bloom.
7. Baseline e2e âncora: capturar "sem realce == hoje" e **nunca** mudar ao
   longo das ondas (é o trap de regressão de honestidade verificado por
   máquina). Re-baseline do frame default no máximo 1× por onda.

### Onda 2

- Inverse-square da UA de efeméride (escalar CPU). **Fundir com o ganho da
  Onda 1 num ÚNICO uniform por material** (irradiância × ganho didático) —
  senão nascem dois multiplicadores empilhados que depois brigam.
- Auto-exposição **analítica** (função da UA do corpo focado, sem histograma),
  com rampa em espaço log amarrada ao PROGRESSO do voo
  (`StellarFlightTransition` cruza ~10 stops) — e medindo radiância PRÉ-ganho.
- Registro de exposição: enumerar toda fonte de luminância fora do caminho de
  luz (disco solar, atmosfera, anéis, night lights, starfield) e todo threshold
  fixo (Bloom 1.0, LightGlow, LensFlare) — teste unitário barato que varre os
  pontos de construção.
- Planetshine como uniform de segunda fonte no wrapper per-light (NUNCA luz de
  cena): **Io (R≈9×10⁻³) + Europa (3,6×10⁻³)** — Io recebe ~2,5× o
  Jupiter-shine de Europa; só-Europa era cherry-picking. Documentar a exclusão
  de Ganimedes (2,2×10⁻³) e o piso usado. Earthshine na Lua nos modos
  realçados (o único planetshine visível a olho nu — gancho pedagógico).

### Extensão às luas geladas — CORRIGIDA

- **LS puro em gelo brilhante é erro de regime** (Tétis ~0,8; LS vale para
  regolito escuro ~0,12). Usar blend lunar-Lambert parametrizado por albedo
  (McEwen 1991), ou adiar até os albedos citados da Onda 3. Iapetus é bimodal
  (0,04/0,6) — qualquer lei única é duplamente aproximada; divulgar.

### Onda 3

- Albedo geométrico citado por corpo; diâmetro angular do Sol → penumbra
  (precedente NASA Eyes); surto de oposição.

### Morto (não ressuscitar)

- Sistema geral de N luzes de planetshine (over-engineering, §16).
- Luz de preenchimento simétrica (superada por este redesenho).
- Uma luz de cena por corpo (repete o erro do SmartSunLight; three não escopa
  luz por objeto; mudar contagem de luzes recompila as 5 famílias de materiais
  patchados — hitch de centenas de ms).

## 5. Decisões de design EM ABERTO (ninguém decidiu)

1. **Escala didática × irradiância física**: corpo que PARECE perto mas é
   ILUMINADO como longe — qual história espacial a luz conta no modo didático,
   e como divulgar? (Maior questão não resolvida do plano.)
2. **Divulgação em screenshot/export**: a pílula não viaja com a imagem.
   Legenda gravada, metadata, ou export sempre em "brilho real"?
3. **Âncora radiométrica**: o que significa 0 EV fisicamente? Sem isso a
   auto-exposição "analítica" não tem contra o que calcular.
4. **Especular**: o lobo GGX ainda dispara em corpos regolith a ângulos
   rasantes; o patch só corrige difusa. Escopar ou matar?
5. **Corpos via PlanetModel** (haumea, vesta, pallas, hygiea): todo mecanismo
   por material os pula; sob irradiância real viram outliers de brilho.
6. **Sistema de divulgação**: superfície única de fidelidade com linhas
   expandíveis (Escala / Brilho, cada uma clicável) vs segunda pílula.
   Duas pílulas âmbar permanentes = cegueira de banner.
7. **Adaptação de display**: step wedge de 10s ("quantos tons de cinza você
   vê?") persistido por dispositivo — o argumento do projetor é assertado,
   nunca medido.

## 6. Checklist de verificação da implementação

(Prometido na conversa de origem — rodar contra o diff final.)

1. Fix do patch é per-light (wrapper `RE_Direct`), não pós-soma; teste de
   quadratura atualizado junto.
2. Nenhuma luz de cena nova; rim/planetshine como uniforms. Se luz real for
   inevitável, montada permanente com intensity 0 (congela hash do programa).
3. Nada rotulado "Científico" enquanto `decay=0`; nomes por consequência.
4. Ganho ≠ 1 tem operador de tone mapping montado, ou cap sob o bloom threshold.
5. Piso ambiente flui pelos lerp targets (não é sobrescrito por frame).
6. 5 controles mortos removidos, ambiente reaproveitado, testes-pin removidos
   no mesmo PR.
7. Planetshine (se houver): Io incluído, tabela de R publicada.
8. Baseline âncora "sem realce == hoje" criada; segunda pílula não estoura o
   gate de 1% do boot.spec sem regen intencional.
9. Emissivos e atmosfera não descolam da superfície em stops ≠ 0 (ou registro
   de exposição documenta a pendência).
10. Modo tudo-desligado pinado por teste (uniforms de realce ≡ neutro), não só
    por texto de UI.

## 7. Fontes primárias

- NASA Eyes (bundle): https://eyes.nasa.gov/apps/solar-system/
- OpenSpace: https://github.com/OpenSpace/OpenSpace/blob/master/modules/globebrowsing/src/renderableglobe.cpp
- Stellarium: https://github.com/Stellarium/stellarium/blob/master/src/core/modules/Planet.cpp
  e https://github.com/Stellarium/stellarium/issues/669
- SpaceEngine manual: https://spaceengine.org/manual/user-manual/ e
  https://spaceengine.org/manual/making-addons/creating-a-planet/
- Universe Sandbox U35: https://universesandbox.com/blog/2025/03/space-in-a-new-light-update-35/
- Fotometria: McEwen 1991 (lunar-Lambert); Lauer et al. 2021 PSJ 2,214
  (Charon-light); Glenar et al. 2019 (earthshine); Mergny & Schmidt 2024
  (Jupiter-shine em Europa).
