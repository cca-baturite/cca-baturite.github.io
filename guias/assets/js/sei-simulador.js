(function () {
  "use strict";

  const screen = document.getElementById("sim-screen");
  const feedbackBox = document.getElementById("global-feedback");
  const progressWrap = document.getElementById("progress-wrap");
  const progressLabel = document.getElementById("progress-label");
  const progressName = document.getElementById("progress-name");
  const progressValue = document.getElementById("progress-value");
  const previousButton = document.getElementById("previous-button");
  const restartButton = document.getElementById("restart-button");
  const announcer = document.getElementById("screen-announcer");
  const configPath = screen.dataset.config;

  const STEPS = [
    "Preparação",
    "Acesso",
    "Processo novo",
    "Tipo de processo",
    "Dados iniciais",
    "Requerimento",
    "Nível de acesso",
    "Anexos",
    "Assinatura",
    "Recibo"
  ];

  const CAMPUS_CITIES = [
    "Acaraú", "Acopiara", "Aracati", "Baturité", "Boa Viagem", "Camocim",
    "Canindé", "Caucaia", "Cedro", "Crateús", "Crato", "Fortaleza",
    "Guaramiranga", "Horizonte", "Iguatu", "Itapipoca", "Jaguaribe",
    "Jaguaruana", "Juazeiro do Norte", "Limoeiro do Norte", "Maracanaú",
    "Maranguape", "Mombaça", "Morada Nova", "Paracuru", "Pecém", "Quixadá",
    "Sobral", "Tabuleiro do Norte", "Tauá", "Tianguá", "Ubajara", "Umirim"
  ];

  const REQUEST_OPTIONS = [
    ["Aproveitamento de disciplina(s)", "aproveitamento"],
    ["Cancelamento de matrícula", "cancelamento-matricula"],
    ["Certificado/Diploma de conclusão", "certificado-diploma"],
    ["Justificativa de falta / 2ª chamada de prova(s)", "segunda-chamada"],
    ["Programa de disciplina - PUD da(s) disciplina(s)", "pud"],
    ["Solicitação de colação de grau", "colacao-grau"],
    ["Quebra de pré-requisito para cursar disciplina(s)", "quebra-pre-requisito"],
    ["Regime de exercício domiciliar", "exercicio-domiciliar"],
    ["Trancamento de disciplina(s)", "trancamento-disciplinas"],
    ["Trancamento de matrícula", "trancamento-matricula"],
    ["Outro", "outro"]
  ];

  let config = null;
  let procedure = null;
  let state = null;
  let currentView = null;
  let navigationHistory = [];

  function newState() {
    return {
      mode: "guiado",
      packaging: "unico",
      step: 0,
      specification: "",
      requestSaved: false,
      requestKind: "",
      requestDetail: "",
      selectedFile: null,
      docsAdded: [],
      petitionStarted: false,
      issues: new Set(),
      processNumber: "",
      startedAt: new Date()
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  }

  function recordIssue(message) {
    state.issues.add(message);
  }

  function clearFeedback() {
    feedbackBox.hidden = true;
    feedbackBox.className = "feedback";
    feedbackBox.textContent = "";
  }

  function showFeedback(message, type) {
    feedbackBox.hidden = false;
    feedbackBox.className = "feedback is-" + (type || "warning");
    feedbackBox.innerHTML = message;
    feedbackBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hint(title, text, href) {
    if (state.mode !== "guiado") return "";
    const link = href ? ` <a href="${href}">Ver no guia detalhado</a>.` : "";
    return `<div class="hint"><strong>${escapeHtml(title)}</strong><p>${text}${link}</p></div>`;
  }

  function setStep(index) {
    state.step = index;
    progressWrap.hidden = false;
    progressLabel.textContent = "Etapa " + (index + 1) + " de " + STEPS.length;
    progressName.textContent = STEPS[index];
    progressValue.style.width = (((index + 1) / STEPS.length) * 100) + "%";
    announcer.textContent = "Etapa " + (index + 1) + ": " + STEPS[index];
    clearFeedback();
  }

  function updateNavigationButtons() {
    previousButton.hidden = navigationHistory.length === 0;
  }

  function navigate(renderFunction) {
    if (currentView && currentView !== renderFunction) navigationHistory.push(currentView);
    currentView = renderFunction;
    renderFunction();
    updateNavigationButtons();
  }

  function goBack() {
    if (!navigationHistory.length) return;
    currentView = navigationHistory.pop();
    currentView();
    updateNavigationButtons();
  }

  function screenHeader(title, subtitle, actionHtml) {
    const action = actionHtml || '<span class="screen-header-mark">CCA · TREINO</span>';
    return `<div class="screen-header"><div class="screen-header-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle || "Ambiente simulado")}</span></div><div class="screen-header-action">${action}</div></div>`;
  }

  function requiredDocs() {
    return procedure.requiredDocuments.filter(function (doc) {
      return doc.packaging === "sempre" || doc.packaging === state.packaging;
    });
  }

  function renderSetup() {
    progressWrap.hidden = true;
    previousButton.hidden = true;
    restartButton.hidden = true;
    clearFeedback();
    screen.innerHTML = screenHeader("Preparar treinamento", "Nada será enviado") + `
      <div class="screen-body">
        <h3 class="screen-title">O que você deseja solicitar?</h3>
        <p class="screen-subtitle">A lista é taxativa. Outros treinamentos serão incluídos futuramente.</p>
        <div class="field">
          <label for="procedure-select">Solicitação</label>
          <select id="procedure-select">
            <option value="">Selecione…</option>
            <option value="aproveitamento-disciplinas">Aproveitamento de disciplinas</option>
          </select>
        </div>
        <fieldset class="field">
          <legend>Como deseja treinar?</legend>
          <div class="choice-list">
            <label class="choice" for="mode-guided">
              <input checked id="mode-guided" name="mode" type="radio" value="guiado"/>
              <span><strong>Modo guiado</strong><span>Mostra orientações antes das decisões mais importantes.</span></span>
            </label>
            <label class="choice" for="mode-free">
              <input id="mode-free" name="mode" type="radio" value="livre"/>
              <span><strong>Modo livre</strong><span>Você começa do zero e recebe um resultado ao final.</span></span>
            </label>
          </div>
        </fieldset>
        <fieldset class="field">
          <legend>Como os programas, PUDs ou ementas serão organizados?</legend>
          <div class="choice-list">
            <label class="choice" for="package-one">
              <input checked id="package-one" name="packaging" type="radio" value="unico"/>
              <span><strong>Um único PDF — recomendado</strong><span>Facilita a conferência quando há muitos componentes. O arquivo deve permanecer com até 10 MB.</span></span>
            </label>
            <label class="choice" for="package-many">
              <input id="package-many" name="packaging" type="radio" value="separados"/>
              <span><strong>PDFs separados</strong><span>Cada programa, PUD ou ementa será adicionado individualmente.</span></span>
            </label>
          </div>
        </fieldset>
        <div class="button-row">
          <button class="sim-button sim-button-primary" id="setup-continue" type="button">Conferir documentos antes de começar</button>
        </div>
      </div>`;

    document.getElementById("setup-continue").addEventListener("click", function () {
      const selected = document.getElementById("procedure-select").value;
      if (!selected) {
        showFeedback("Selecione a solicitação que deseja treinar.", "error");
        return;
      }
      procedure = config.procedures.find(function (item) { return item.id === selected; });
      state.mode = document.querySelector('input[name="mode"]:checked').value;
      state.packaging = document.querySelector('input[name="packaging"]:checked').value;
      restartButton.hidden = false;
      navigate(renderPreflight);
    });
  }

  function renderPreflight() {
    setStep(0);
    const programsText = state.packaging === "unico"
      ? "um único PDF com todos os programas, PUDs ou ementas"
      : "PDFs separados para os programas, PUDs ou ementas";
    screen.innerHTML = screenHeader("Antes de entrar no SEI", "Prepare tudo primeiro") + `
      <div class="screen-body">
        <h3 class="screen-title">Não comece sem os documentos</h3>
        <p class="screen-subtitle">No SEI real, interromper o preenchimento para procurar arquivos pode fazer você perder o trabalho.</p>
        <div class="panel panel-accent">
          <h3>Documentos obrigatórios</h3>
          <ol class="document-list">
            <li><a href="https://docs.google.com/document/d/1y7Uy13fz6Au-0lteWyyS2EddRcB7ekpo/edit#heading=h.gjdgxs" rel="noopener noreferrer" target="_blank">Formulário de Solicitação de Aproveitamento de Componente Curricular</a> <strong>preenchido e assinado</strong>.</li>
            <li>Histórico escolar, com a carga horária dos componentes curriculares, <strong>autenticado pela instituição de origem</strong>.</li>
            <li>Programas dos componentes curriculares, <strong>devidamente autenticados pela instituição de origem</strong>.</li>
          </ol>
          <p><strong>Nesta simulação:</strong> você escolheu ${escapeHtml(programsText)}. Somente os programas, PUDs ou ementas podem ser reunidos; o formulário e o histórico continuam separados.</p>
        </div>
        <div class="resource-links" aria-label="Formulários de apoio">
          <a class="sim-button sim-button-secondary" href="https://docs.google.com/document/d/1y7Uy13fz6Au-0lteWyyS2EddRcB7ekpo/edit#heading=h.gjdgxs" rel="noopener noreferrer" target="_blank">Abrir formulário real — nova guia</a>
          <a class="sim-button sim-button-muted" href="assets/sei-simulador/formulario-aproveitamento-ficticio.pdf" rel="noopener noreferrer" target="_blank">Ver formulário fictício preenchido</a>
        </div>
        <details class="panel">
          <summary><strong>Conferir os dados usados no formulário fictício</strong></summary>
          <div class="data-grid">
            <div class="data-row"><span>Situação</span><strong>Aluno veterano</strong></div>
            <div class="data-row"><span>Aluno</span><strong>Fulano de Tal</strong></div>
            <div class="data-row"><span>Matrícula</span><strong>20251154000000</strong></div>
            <div class="data-row"><span>Curso</span><strong>Letras</strong></div>
            <div class="data-row"><span>CPF</span><strong>XXX.XXX.XXX-XX</strong></div>
            <div class="data-row"><span>Data de nascimento</span><strong>DD/MM/AAAA</strong></div>
            <div class="data-row"><span>Telefone</span><strong>(85) 9XXXX-XXXX</strong></div>
            <div class="data-row"><span>E-mail</span><strong>fulanodetal@gmail.com</strong></div>
            <div class="data-row"><span>Assinatura fictícia</span><strong>Fulano de Tal</strong></div>
          </div>
          <div class="panel panel-accent">
            <strong>Critérios acadêmicos do ROD</strong>
            <p>A carga horária do componente apresentado deve corresponder a, no mínimo, <strong>75%</strong> da carga horária do componente a ser aproveitado. O conteúdo também deve apresentar, no mínimo, <strong>75% de compatibilidade</strong>.</p>
            <p>A equivalência não precisa ser exata. A análise e a decisão cabem ao setor acadêmico competente.</p>
            <p><strong>Instituição de origem:</strong> Instituição de Ensino Fictícia<br/><strong>Curso de origem:</strong> Licenciatura em Letras</p>
            <p><strong>Observação:</strong> solicito o aproveitamento dos componentes relacionados, conforme a documentação anexa.</p>
          </div>
          <p class="field-help">O formulário anexado no exercício já contém componentes curriculares fictícios e assinatura simulada.</p>
        </details>
        ${hint("Regra prática", "No exercício, todos os arquivos estão em uma gaveta fictícia. No SEI real, abra cada PDF e confira páginas, legibilidade, autenticação e tamanho antes de começar.", "sei-abrir-solicitacao-celular.html#antes")}
        <label class="choice" for="preflight-confirm">
          <input id="preflight-confirm" type="checkbox"/>
          <span><strong>Entendi e preparei os documentos fictícios</strong><span>Nenhum arquivo real será selecionado neste site.</span></span>
        </label>
        <div class="button-row">
          <button class="sim-button sim-button-primary" id="preflight-start" type="button">Iniciar treinamento</button>
        </div>
      </div>`;

    document.getElementById("preflight-start").addEventListener("click", function () {
      if (!document.getElementById("preflight-confirm").checked) {
        recordIssue("Tentou iniciar sem confirmar a preparação dos documentos");
        showFeedback("Confirme a preparação antes de entrar no SEI simulado.", "error");
        return;
      }
      navigate(renderLogin);
    });
  }

  function renderLogin() {
    setStep(1);
    screen.innerHTML = screenHeader("Escolha o ambiente de acesso", "Tela simulada") + `
      <div class="screen-body">
        <h3 class="screen-title">Onde Fulano de Tal deve entrar?</h3>
        <p class="screen-subtitle">Ele é estudante e possui cadastro como usuário externo.</p>
        ${hint("Confira o título da página", "Para protocolar uma solicitação acadêmica, o estudante usa Acesso para Usuários Externos. Não há campos para credenciais reais neste treinamento.", "sei-abrir-solicitacao-celular.html#login")}
        <div class="option-list">
          <button class="option-button" data-login="servidor" type="button"><strong>Acesso para servidores</strong><small>Área interna destinada a servidores do IFCE.</small></button>
          <button class="option-button" data-login="externo" type="button"><strong>Acesso para Usuários Externos</strong><small>Área destinada ao estudante cadastrado.</small></button>
        </div>
        <div class="panel fake-user">
          <span class="avatar" aria-hidden="true">FT</span>
          <div><strong>Fulano de Tal</strong><span>Identidade fictícia · nenhuma senha será solicitada</span></div>
        </div>
      </div>`;

    screen.querySelectorAll("[data-login]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.login === "externo") {
          navigate(renderHome);
          return;
        }
        recordIssue("Escolheu a área de servidores");
        showFeedback("Essa área é destinada a servidores. Para esta missão, escolha <strong>Acesso para Usuários Externos</strong>.", "error");
      });
    });
  }

  function renderHome() {
    setStep(2);
    screen.innerHTML = screenHeader("SEI — Usuário Externo", "Fulano de Tal", '<button aria-controls="mobile-menu" aria-expanded="false" class="screen-menu-button" id="open-menu" type="button"><span>Menu</span><span aria-hidden="true">⋮</span></button>') + `
      <div class="screen-body">
        <h3 class="screen-title">Página inicial</h3>
        <p class="screen-subtitle">Abra <strong>Menu (lado superior direito)</strong> para iniciar uma solicitação do zero.</p>
        ${hint("Caminho correto", "Abra Menu (lado superior direito), depois Peticionamento e, por fim, Processo Novo.", "sei-abrir-solicitacao-celular.html#processo-novo")}
        <div class="mobile-menu" id="mobile-menu" hidden>
          <button aria-controls="petition-submenu" aria-expanded="false" id="open-petition-menu" type="button"><span>Peticionamento</span><span class="menu-arrow" aria-hidden="true">▾</span></button>
          <div class="submenu" id="petition-submenu" hidden>
            <button data-petition="new" type="button">Processo Novo</button>
            <button data-petition="intercurrent" type="button">Peticionamento Intercorrente</button>
          </div>
        </div>
      </div>`;

    document.getElementById("open-menu").addEventListener("click", function () {
      const menu = document.getElementById("mobile-menu");
      const expanded = this.getAttribute("aria-expanded") !== "true";
      menu.hidden = !expanded;
      this.setAttribute("aria-expanded", String(expanded));
    });
    document.getElementById("open-petition-menu").addEventListener("click", function () {
      const submenu = document.getElementById("petition-submenu");
      const expanded = this.getAttribute("aria-expanded") !== "true";
      submenu.hidden = !expanded;
      this.setAttribute("aria-expanded", String(expanded));
    });
    screen.querySelectorAll("[data-petition]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.petition === "new") {
          navigate(renderType);
          return;
        }
        recordIssue("Escolheu Peticionamento Intercorrente para abrir um processo novo");
        showFeedback("<strong>Peticionamento Intercorrente é uma opção válida, mas não para esta missão.</strong> Ele serve para anexar documentos a um processo que já foi criado, inclusive documentos esquecidos ou complementares. Para começar do zero, use <strong>Processo Novo</strong>.", "warning");
      });
    });
  }

  function renderType() {
    setStep(3);
    const options = [
      ["Servidor: Requerimento Geral", "servidor"],
      ["Aluno: Requerimento Geral", "correct"],
      ["Solicitação de acesso externo", "cadastro"],
      ["Diploma: registro institucional", "diploma"]
    ];
    screen.innerHTML = screenHeader("Peticionamento — Processo Novo", "Escolha o tipo") + `
      <div class="screen-body">
        <h3 class="screen-title">Tipo do processo</h3>
        <p class="screen-subtitle">Missão: ${escapeHtml(procedure.label)}.</p>
        ${hint("Tipo usado pela CCA", "Para esta solicitação, escolha Aluno: Requerimento Geral.", "sei-abrir-solicitacao-celular.html#tipo-processo")}
        <div class="option-list">
          ${options.map(function (item) {
            return `<button class="option-button" data-type="${item[1]}" type="button">${escapeHtml(item[0])}</button>`;
          }).join("")}
        </div>
      </div>`;

    screen.querySelectorAll("[data-type]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.type === "correct") {
          navigate(renderInitialData);
          return;
        }
        recordIssue("Escolheu um tipo de processo incompatível");
        showFeedback("Esse tipo não corresponde à solicitação de um estudante. Procure <strong>Aluno: Requerimento Geral</strong>.", "error");
      });
    });
  }

  function renderInitialData() {
    setStep(4);
    screen.innerHTML = screenHeader("Aluno: Requerimento Geral", "Dados iniciais") + `
      <div class="screen-body">
        <h3 class="screen-title">Identifique a solicitação</h3>
        ${hint("Escreva somente o nome", "A recomendação é “Aproveitamento de disciplinas”. A CCA também aceita variações equivalentes, sem justificativas neste campo.", "sei-abrir-solicitacao-celular.html#dados-iniciais")}
        <div class="field">
          <label for="specification">Especificação <span aria-hidden="true">*</span></label>
          <button class="spec-suggestion" id="fill-specification" type="button">Usar recomendação: Aproveitamento de disciplinas</button>
          <input id="specification" maxlength="100" value="${escapeHtml(state.specification)}"/>
          <span class="field-help" id="char-count">0 de 100 caracteres</span>
        </div>
        <div class="field">
          <label for="city">Cidade <span aria-hidden="true">*</span></label>
          <select id="city">
            <option value="">Selecione…</option>
            ${CAMPUS_CITIES.map(function (city) { return `<option>${escapeHtml(city)}</option>`; }).join("")}
          </select>
          <span class="field-help">Lista institucional simulada com as cidades dos 33 campi. Escolha a cidade do campus responsável, não a cidade onde o estudante mora.</span>
        </div>
        <div class="button-row">
          <button class="sim-button sim-button-primary" id="initial-continue" type="button">Continuar</button>
        </div>
      </div>`;

    const specification = document.getElementById("specification");
    const charCount = document.getElementById("char-count");
    function updateCount() {
      charCount.textContent = specification.value.length + " de 100 caracteres";
    }
    updateCount();
    specification.addEventListener("input", updateCount);
    document.getElementById("fill-specification").addEventListener("click", function () {
      specification.value = procedure.recommendedSpecification;
      updateCount();
      specification.focus();
    });
    document.getElementById("initial-continue").addEventListener("click", function () {
      const value = specification.value.trim();
      const accepted = procedure.acceptedSpecifications.map(normalize).includes(normalize(value));
      const city = document.getElementById("city").value;
      if (!accepted) {
        recordIssue("Preencheu a especificação com texto vago ou incompatível");
        showFeedback("Use somente o nome da solicitação. Recomendação: <strong>Aproveitamento de disciplinas</strong>.", "error");
        return;
      }
      if (city !== procedure.city) {
        recordIssue("Selecionou cidade diferente de Baturité");
        showFeedback("Selecione <strong>Baturité</strong>, cidade do campus responsável pelo processo.", "error");
        return;
      }
      state.specification = value;
      if (normalize(value) !== normalize(procedure.recommendedSpecification)) {
        showFeedback("A variação informada é aceita pela CCA. A forma recomendada continua sendo <strong>Aproveitamento de disciplinas</strong>.", "success");
        window.setTimeout(function () { navigate(renderRequestDocument); }, 900);
        return;
      }
      navigate(renderRequestDocument);
    });
  }

  function renderRequestDocument() {
    setStep(5);
    const status = state.requestSaved
      ? '<div class="panel panel-success"><strong>Requerimento Geral Discente salvo.</strong><p>Retorne ao peticionamento pela caixa de guias do navegador.</p></div>'
      : '<p class="screen-subtitle">O documento principal abre em outra guia do navegador.</p>';
    screen.innerHTML = screenHeader("Documentos", "Peticionamento principal") + `
      <div class="screen-body">
        <h3 class="screen-title">Requerimento Geral Discente</h3>
        ${status}
        ${hint("Dois formulários diferentes", "Este é o documento principal interno do SEI. O Formulário de Aproveitamento preenchido e assinado será anexado depois como PDF complementar.", "sei-abrir-solicitacao-celular.html#requerimento")}
        <button class="option-button" id="open-request" type="button"><strong>Requerimento Geral Discente</strong><small>Clique aqui para editar o conteúdo</small></button>
        ${state.requestSaved ? '<div class="button-row"><button class="sim-button sim-button-primary" id="request-continue" type="button">Definir nível de acesso</button></div>' : ""}
      </div>`;

    document.getElementById("open-request").addEventListener("click", function () { navigate(renderRequestTab); });
    const continueButton = document.getElementById("request-continue");
    if (continueButton) continueButton.addEventListener("click", function () { navigate(renderMainAccess); });
  }

  function renderRequestTab() {
    setStep(5);
    const selectedRequest = state.requestKind;
    screen.innerHTML = `
      <div class="mobile-browser-bar" aria-label="Barra simulada do navegador do celular">
        <span class="browser-home" aria-hidden="true">⌂</span>
        <div class="browser-address"><span aria-hidden="true">⌘</span><span>sei.ifce.edu.br/sei/controlador…</span></div>
        <span class="browser-plus" aria-hidden="true">＋</span>
        <button aria-label="Abrir as duas guias do navegador" class="browser-tabs-button${state.requestSaved ? " is-next" : ""}" id="browser-tabs-button" type="button"><span>2</span></button>
        <span class="browser-more" aria-hidden="true">⋮</span>
      </div>
      <div class="sei-editor-page">
        <div class="sei-editor-toolbar" aria-label="Faixa simulada de edição do SEI">
          <div class="editor-save-row">
            <button class="sei-save-button${state.requestSaved ? " is-saved" : ""}" id="request-save" type="button"><span aria-hidden="true">▣</span>${state.requestSaved ? "Salvo" : "Salvar"}</button>
          </div>
          <div class="editor-tools-row" aria-hidden="true">
            <span>🔎</span><span>▱</span><span>▰</span><strong>N</strong><em>I</em><u>S</u><span>abc</span><span>x₂</span><span>x²</span><span>🎨</span><span>A▾</span>
          </div>
          <div class="editor-tools-row" aria-hidden="true">
            <span>✂</span><span>▣</span><span>↶</span><span>↷</span><span>¶</span><span>Ω</span><span>☷</span><span>☰</span><span>▤</span><span>▧</span>
          </div>
          <div class="editor-tools-row editor-style-row" aria-hidden="true">
            <span>▦</span><span>🌐</span><span>§</span><span class="editor-style-select">Texto_Alinhado_Esquerda ▾</span>
          </div>
        </div>
        <div aria-live="polite" class="editor-save-notice" id="editor-save-notice" ${state.requestSaved ? "" : "hidden"}>Documento salvo. Toque no contador <strong>2</strong>, no canto superior direito, e escolha a guia do peticionamento.</div>
        <div class="sei-document-scroll">
          <div class="sei-document-sheet">
            <section class="sei-document-section" aria-labelledby="basic-data-title">
              <h3 id="basic-data-title">DADOS BÁSICOS DO INTERESSADO</h3>
              <div class="sei-data-line"><strong>Nome do Discente:</strong> Fulano de Tal</div>
              <div class="sei-data-line"><strong>Nome Social (opcional, identidade de gênero):</strong></div>
              <div class="sei-data-split"><div><strong>Matrícula:</strong> 20251154000000</div><div><strong>E-mail:</strong> fulanodetal@gmail.com</div></div>
              <div class="sei-data-line"><strong>Curso:</strong> Letras</div>
            </section>
            <fieldset class="sei-request-section">
              <legend>SOLICITO</legend>
              <div class="sei-request-options">
                ${REQUEST_OPTIONS.map(function (item) {
                  return `<label><input ${selectedRequest === item[1] ? "checked" : ""} name="request-kind" type="radio" value="${escapeHtml(item[1])}"/><span>${escapeHtml(item[0])}</span></label>`;
                }).join("")}
              </div>
            </fieldset>
            <div class="sei-detail-section">
              <label for="request-detail"><strong>Especificação detalhada da solicitação:</strong> <span class="optional-label">(opcional)</span></label>
              <textarea id="request-detail">${escapeHtml(state.requestDetail)}</textarea>
            </div>
            <div class="sei-observations">
              <strong>OBSERVAÇÕES:</strong>
              <ul>
                <li>Preencha completamente os dados básicos do interessado.</li>
                <li>Use a especificação detalhada se precisar explicar melhor seu objetivo.</li>
                <li>Os documentos complementares serão incluídos em PDF na guia do peticionamento.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById("browser-tabs-button").addEventListener("click", function () {
      const selected = screen.querySelector('input[name="request-kind"]:checked');
      state.requestKind = selected ? selected.value : "";
      state.requestDetail = document.getElementById("request-detail").value.trim();
      navigate(renderBrowserTabs);
    });
    document.getElementById("request-save").addEventListener("click", function () {
      const selected = screen.querySelector('input[name="request-kind"]:checked');
      const kind = selected ? selected.value : "";
      const detail = document.getElementById("request-detail").value.trim();
      if (kind !== "aproveitamento") {
        recordIssue("Não selecionou Aproveitamento de disciplina(s) em Solicito");
        showFeedback("Em <strong>Solicito</strong>, escolha <strong>Aproveitamento de disciplina(s)</strong>.", "error");
        return;
      }
      state.requestKind = kind;
      state.requestDetail = detail;
      state.requestSaved = true;
      const saveButton = document.getElementById("request-save");
      saveButton.classList.add("is-saved");
      saveButton.innerHTML = '<span aria-hidden="true">✓</span>Salvo';
      document.getElementById("editor-save-notice").hidden = false;
      document.getElementById("browser-tabs-button").classList.add("is-next");
      document.getElementById("browser-tabs-button").setAttribute("aria-label", "Documento salvo. Abrir as duas guias do navegador");
      showFeedback("Requerimento salvo. Agora toque no contador <strong>2</strong>, no canto superior direito do navegador simulado.", "success");
    });
  }

  function renderBrowserTabs() {
    setStep(5);
    const requestStatus = state.requestSaved ? "Documento salvo" : "Alterações ainda não salvas";
    screen.innerHTML = `
      <div class="browser-tabs-overview" aria-label="Seletor simulado de guias do navegador">
        <div class="tabs-overview-toolbar">
          <span class="overview-new-tab" aria-hidden="true">＋</span>
          <div class="overview-mode" aria-hidden="true"><span class="is-active">▣ 2</span><span>▦</span></div>
          <span class="browser-more" aria-hidden="true">⋮</span>
        </div>
        <div class="tabs-search">Pesquise nas guias</div>
        <div class="browser-tab-grid">
          <button class="browser-tab-card" id="choose-petition-tab" type="button">
            <span class="tab-card-title"><span class="sei-mini-logo">sei.</span> SEI — Peticionamento <span aria-hidden="true">×</span></span>
            <span class="tab-card-preview petition-preview"><strong>sei.</strong><small>Menu</small><i>Documento Principal</i><b>Requerimento Geral Discente</b><i>Nível de Acesso</i><span></span><i>Documentos Complementares</i></span>
            <span class="tab-card-action">Retornar a esta guia</span>
          </button>
          <button class="browser-tab-card is-current" id="choose-request-tab" type="button">
            <span class="tab-card-title"><span class="sei-mini-logo">sei.</span> SEI — Requerimento <span aria-hidden="true">×</span></span>
            <span class="tab-card-preview request-preview"><b>▣ Salvar</b><i>N &nbsp; I &nbsp; <u>S</u> &nbsp; ≡ &nbsp; ☷</i><strong>DADOS BÁSICOS DO INTERESSADO</strong><span>Nome do Discente: Fulano de Tal</span><strong>SOLICITO</strong><span>(●) Aproveitamento de disciplina(s)</span></span>
            <span class="tab-card-action">${escapeHtml(requestStatus)}</span>
          </button>
        </div>
        <div class="tabs-overview-note">Selecione a guia do peticionamento para continuar o processo.</div>
      </div>`;

    document.getElementById("choose-petition-tab").addEventListener("click", function () { navigate(renderRequestDocument); });
    document.getElementById("choose-request-tab").addEventListener("click", function () { navigate(renderRequestTab); });
  }

  function renderMainAccess() {
    setStep(6);
    screen.innerHTML = screenHeader("Documento principal", "Nível de acesso") + `
      <div class="screen-body">
        <h3 class="screen-title">Proteja os dados pessoais</h3>
        ${hint("Configuração esperada", "No Requerimento Geral Discente, selecione Restrito e Informação Pessoal.", "sei-abrir-solicitacao-celular.html#acesso-principal")}
        <div class="field">
          <label for="main-access">Nível de acesso</label>
          <select id="main-access">
            <option value="">Selecione…</option>
            <option value="publico">Público</option>
            <option value="restrito">Restrito</option>
          </select>
        </div>
        <div class="field">
          <label for="main-hypothesis">Hipótese legal</label>
          <select id="main-hypothesis">
            <option value="">Selecione…</option>
            <option value="pessoal">Informação Pessoal (Art. 31 da Lei nº 12.527/2011)</option>
            <option value="sigilo">Sigilo de empresa</option>
          </select>
        </div>
        <div class="button-row">
          <button class="sim-button sim-button-primary" id="main-access-continue" type="button">Ir para os anexos</button>
        </div>
      </div>`;

    document.getElementById("main-access-continue").addEventListener("click", function () {
      if (document.getElementById("main-access").value !== "restrito" || document.getElementById("main-hypothesis").value !== "pessoal") {
        recordIssue("Configurou incorretamente o acesso do documento principal");
        showFeedback("Use <strong>Restrito</strong> e <strong>Informação Pessoal</strong> no documento principal.", "error");
        return;
      }
      navigate(renderAttachments);
    });
  }

  function renderAttachments() {
    setStep(7);
    const docs = requiredDocs();
    const pending = docs.filter(function (doc) { return !state.docsAdded.some(function (added) { return added.id === doc.id; }); });
    const selected = docs.find(function (doc) { return doc.id === state.selectedFile; });
    const addedHtml = state.docsAdded.length
      ? `<ul class="added-files">${state.docsAdded.map(function (doc) { return `<li><span><strong>${escapeHtml(doc.fileName)}</strong><br/><small>${escapeHtml(doc.complement)} · ${escapeHtml(doc.formatLabel)}</small></span></li>`; }).join("")}</ul>`
      : '<p class="field-help">Nenhum documento adicionado. Escolher um PDF não basta: ele precisa aparecer nesta lista.</p>';
    const selectedHtml = selected ? renderAttachmentForm(selected) : "";

    screen.innerHTML = screenHeader("Documentos complementares", "Gaveta fictícia") + `
      <div class="screen-body">
        <h3 class="screen-title">Adicione os PDFs obrigatórios</h3>
        <p class="screen-subtitle">Os arquivos abaixo são fictícios. Leia como cada PDF foi produzido antes de classificá-lo.</p>
        ${hint("Repita para cada PDF", "Tipo Anexo, complemento descritivo, Restrito, Informação Pessoal e formato conforme a origem. Se for digitalizado, use Cópia simples. Finalize em Adicionar.", "sei-abrir-solicitacao-celular.html#adicionar-documento")}
        <div class="file-drawer">
          ${docs.map(function (doc) {
            const wasAdded = state.docsAdded.some(function (added) { return added.id === doc.id; });
            const selectedClass = selected && selected.id === doc.id ? " is-selected" : "";
            return `<button class="file-card${selectedClass}" data-file="${escapeHtml(doc.id)}" ${wasAdded ? "disabled" : ""} type="button"><strong>${wasAdded ? "✓ " : ""}${escapeHtml(doc.fileName)}</strong><span>PDF · ${escapeHtml(doc.size)} · ${wasAdded ? "adicionado" : "toque para selecionar"}</span></button>`;
          }).join("")}
        </div>
        ${selectedHtml}
        <div class="panel">
          <h3>Documentos que já aparecem na tabela</h3>
          ${addedHtml}
        </div>
        <div class="button-row">
          <button class="sim-button sim-button-primary" id="finish-attachments" type="button">Conferir anexos e peticionar</button>
        </div>
        <p class="field-help">${pending.length} documento(s) ainda não adicionado(s).</p>
      </div>`;

    screen.querySelectorAll("[data-file]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.selectedFile = button.dataset.file;
        renderAttachments();
      });
    });
    const suggestion = document.getElementById("use-complement");
    if (suggestion) {
      suggestion.addEventListener("click", function () {
        document.getElementById("attachment-complement").value = selected.complement;
      });
    }
    screen.querySelectorAll('input[name="attachment-format"]').forEach(function (radio) {
      radio.addEventListener("change", toggleConference);
    });
    const addButton = document.getElementById("add-attachment");
    if (addButton) addButton.addEventListener("click", function () { addAttachment(selected); });
    document.getElementById("finish-attachments").addEventListener("click", function () {
      const missing = docs.filter(function (doc) { return !state.docsAdded.some(function (added) { return added.id === doc.id; }); });
      if (missing.length) {
        recordIssue("Tentou peticionar antes de adicionar todos os documentos");
        showFeedback("Ainda faltam " + missing.length + " PDF(s). O arquivo só foi incluído quando aparece na tabela.", "error");
        return;
      }
      navigate(renderSignature);
    });
  }

  function renderAttachmentForm(doc) {
    return `
      <div class="panel panel-accent" id="attachment-form">
        <h3>Classificar ${escapeHtml(doc.fileName)}</h3>
        <div class="origin-story"><strong>Como este PDF foi produzido?</strong>${escapeHtml(doc.originStory)}</div>
        <div class="field">
          <label for="attachment-type">Tipo de Documento</label>
          <select id="attachment-type">
            <option value="">Selecione…</option>
            <option value="anexo">Anexo</option>
            <option value="oficio">Ofício</option>
            <option value="certidao">Certidão</option>
          </select>
        </div>
        <div class="field">
          <label for="attachment-complement">Complemento do Tipo de Documento</label>
          <button class="spec-suggestion" id="use-complement" type="button">Usar sugestão: ${escapeHtml(doc.complement)}</button>
          <input id="attachment-complement"/>
        </div>
        <div class="field">
          <label for="attachment-access">Nível de acesso</label>
          <select id="attachment-access">
            <option value="">Selecione…</option>
            <option value="publico">Público</option>
            <option value="restrito">Restrito</option>
          </select>
        </div>
        <div class="field">
          <label for="attachment-hypothesis">Hipótese legal</label>
          <select id="attachment-hypothesis">
            <option value="">Selecione…</option>
            <option value="pessoal">Informação Pessoal</option>
            <option value="sigilo">Sigilo de empresa</option>
          </select>
        </div>
        <fieldset class="field">
          <legend>Formato</legend>
          <div class="choice-list">
            <label class="choice" for="format-native"><input id="format-native" name="attachment-format" type="radio" value="nato-digital"/><span><strong>Nato-digital</strong><span>O documento já nasceu eletrônico.</span></span></label>
            <label class="choice" for="format-scanned"><input id="format-scanned" name="attachment-format" type="radio" value="digitalizado"/><span><strong>Digitalizado</strong><span>Um original em papel virou PDF.</span></span></label>
          </div>
        </fieldset>
        <div class="field" id="conference-field" hidden>
          <label for="attachment-conference">Conferência</label>
          <select id="attachment-conference">
            <option value="">Selecione…</option>
            <option value="copia-simples">Cópia simples</option>
            <option value="original">Documento original</option>
          </select>
        </div>
        <button class="sim-button sim-button-primary" id="add-attachment" type="button">Adicionar</button>
      </div>`;
  }

  function toggleConference() {
    const format = screen.querySelector('input[name="attachment-format"]:checked');
    document.getElementById("conference-field").hidden = !format || format.value !== "digitalizado";
  }

  function addAttachment(doc) {
    const type = document.getElementById("attachment-type").value;
    const complement = document.getElementById("attachment-complement").value.trim();
    const access = document.getElementById("attachment-access").value;
    const hypothesis = document.getElementById("attachment-hypothesis").value;
    const formatInput = screen.querySelector('input[name="attachment-format"]:checked');
    const format = formatInput ? formatInput.value : "";
    const conference = document.getElementById("attachment-conference").value;
    const errors = [];

    if (type !== "anexo") errors.push("Tipo de Documento = Anexo");
    if (!complement) errors.push("Complemento preenchido");
    if (access !== "restrito") errors.push("Nível de acesso = Restrito");
    if (hypothesis !== "pessoal") errors.push("Hipótese legal = Informação Pessoal");
    if (!format) errors.push("Formato informado");
    if (format && format !== doc.correctFormat) {
      errors.push("Formato coerente com a origem descrita");
      recordIssue("Classificou incorretamente a origem de " + doc.fileName);
    }
    if (format === "digitalizado" && conference !== "copia-simples") errors.push("Conferência = Cópia simples");
    if (errors.length) {
      recordIssue("Preencheu incorretamente os metadados de um anexo");
      showFeedback("Revise: <strong>" + errors.join("; ") + "</strong>.", "error");
      return;
    }
    state.docsAdded.push({
      id: doc.id,
      fileName: doc.fileName,
      complement: complement,
      formatLabel: format === "digitalizado" ? "Digitalizado · Cópia simples" : "Nato-digital"
    });
    state.selectedFile = null;
    renderAttachments();
    showFeedback("<strong>Documento adicionado.</strong> Ele agora aparece na tabela.", "success");
  }

  function renderSignature() {
    setStep(8);
    const docs = requiredDocs();
    if (!state.petitionStarted) {
      screen.innerHTML = screenHeader("Conferência final", "Antes da assinatura") + `
        <div class="screen-body">
          <h3 class="screen-title">Pronto para peticionar</h3>
          <div class="panel panel-success">
            <strong>Documento principal salvo e ${docs.length} PDF(s) complementar(es) adicionado(s).</strong>
            <p>Salvar ou adicionar documentos ainda não cria o processo.</p>
          </div>
          ${hint("Só termina após a assinatura", "Toque em Peticionar, escolha Aluno ou Aluna e conclua em Assinar.", "sei-abrir-solicitacao-celular.html#peticionar")}
          <div class="button-row">
            <button class="sim-button sim-button-primary" id="petition-button" type="button">Peticionar</button>
          </div>
        </div>`;
      document.getElementById("petition-button").addEventListener("click", function () {
        state.petitionStarted = true;
        renderSignature();
      });
      return;
    }

    screen.innerHTML = screenHeader("Assinatura Eletrônica", "Concluir peticionamento") + `
      <div class="screen-body">
        <h3 class="screen-title">Assine a simulação</h3>
        <div class="panel fake-user">
          <span class="avatar" aria-hidden="true">FT</span>
          <div><strong>Fulano de Tal</strong><span>Usuário externo fictício</span></div>
        </div>
        <div class="field">
          <label for="signature-role">Cargo/Função</label>
          <select id="signature-role">
            <option value="">Selecione…</option>
            <option value="aluno">Aluno</option>
            <option value="servidor">Servidor</option>
            <option value="representante">Representante legal</option>
          </select>
        </div>
        <div class="data-row"><span>Senha de treinamento</span><strong>•••••••• — campo não editável</strong></div>
        <p class="field-help">Este site nunca pede sua senha. No SEI real, digite-a somente em sei.ifce.edu.br.</p>
        <label class="choice" for="signature-confirm">
          <input id="signature-confirm" type="checkbox"/>
          <span><strong>Reconheço que esta assinatura é apenas simulada</strong><span>Ela não produz efeito administrativo ou jurídico.</span></span>
        </label>
        <div class="button-row">
          <button class="sim-button sim-button-primary" id="sign-button" type="button">Assinar simulação</button>
        </div>
      </div>`;

    document.getElementById("sign-button").addEventListener("click", function () {
      if (document.getElementById("signature-role").value !== "aluno") {
        recordIssue("Escolheu Cargo/Função diferente de Aluno");
        showFeedback("Escolha <strong>Aluno</strong> em Cargo/Função.", "error");
        return;
      }
      if (!document.getElementById("signature-confirm").checked) {
        showFeedback("Confirme que a assinatura é apenas simulada.", "error");
        return;
      }
      navigate(renderReceipt);
    });
  }

  function generateProcessNumber() {
    const values = new Uint32Array(2);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(values);
    } else {
      values[0] = Math.floor(Math.random() * 1000000);
      values[1] = Math.floor(Math.random() * 100);
    }
    const sequence = String(values[0] % 1000000).padStart(6, "0");
    const suffix = String(values[1] % 100).padStart(2, "0");
    return "23484." + sequence + "/" + new Date().getFullYear() + "-" + suffix;
  }

  function renderReceipt() {
    setStep(9);
    if (!state.processNumber) state.processNumber = generateProcessNumber();
    const dateTime = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium",
      timeZone: "America/Fortaleza"
    }).format(new Date());
    const docItems = state.docsAdded.map(function (doc) {
      return `<li>Anexo ${escapeHtml(doc.complement)} — <strong>XXXXXXX</strong></li>`;
    }).join("");
    const score = Math.max(0, 100 - (state.issues.size * 10));
    const result = state.mode === "livre"
      ? `<div class="score"><span>Resultado do modo livre</span><strong>${score}%</strong></div><p>${state.issues.size ? "Você concluiu após corrigir " + state.issues.size + " ponto(s)." : "Você concluiu sem precisar corrigir nenhuma etapa."}</p>`
      : '<div class="panel panel-success"><strong>Treinamento guiado concluído.</strong><p>Você percorreu o fluxo completo com orientações imediatas.</p></div>';

    screen.innerHTML = screenHeader("Treinamento concluído", "Recibo fictício") + `
      <div class="screen-body">
        <div class="receipt">
          <div class="receipt-title">Recibo Eletrônico de Protocolo — SIMULAÇÃO</div>
          <dl>
            <dt>Usuário Externo:</dt><dd>Fulano de Tal</dd>
            <dt>Data e Horário:</dt><dd>${escapeHtml(dateTime)}</dd>
            <dt>Tipo de Peticionamento:</dt><dd>Processo Novo</dd>
            <dt>Número do Processo:</dt><dd><strong>${escapeHtml(state.processNumber)}</strong></dd>
            <dt>Interessados:</dt><dd>Fulano de Tal</dd>
          </dl>
          <h3>Protocolos dos Documentos (Número SEI)</h3>
          <p><strong>Documento Principal</strong></p>
          <ul class="receipt-docs"><li>Requerimento Geral Discente — <strong>XXXXXXX</strong></li></ul>
          <p><strong>Documentos Complementares</strong></p>
          <ul class="receipt-docs">${docItems}</ul>
          <p><strong>SEM VALIDADE:</strong> este recibo, o número do processo e os números SEI foram gerados apenas para treinamento.</p>
        </div>
        ${result}
        <div class="panel panel-warning">
          <strong>E se um documento for esquecido?</strong>
          <p>Depois que o processo real já existir, o Peticionamento Intercorrente pode ser usado para anexar documentos que faltaram ou acrescentar novos documentos. Esse fluxo receberá treinamento próprio futuramente.</p>
        </div>
        <div class="button-row">
          <button class="sim-button sim-button-secondary" id="receipt-restart" type="button">Treinar novamente</button>
          <a class="sim-button sim-button-muted" href="sei-abrir-solicitacao-celular.html">Rever o guia do celular</a>
        </div>
        <div class="button-row">
          <a class="sim-button sim-button-primary" href="https://sei.ifce.edu.br/sei/controlador_externo.php?acao=usuario_externo_logar&amp;acao_origem=usuario_externo_enviar_cadastro&amp;id_orgao_acesso_externo=0" rel="noopener noreferrer" target="_blank">Acessar o SEI real — abre nova guia</a>
        </div>
      </div>`;
    document.getElementById("receipt-restart").addEventListener("click", reset);
  }

  function reset() {
    state = newState();
    procedure = null;
    navigationHistory = [];
    currentView = renderSetup;
    renderSetup();
    updateNavigationButtons();
    document.querySelector(".simulator").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  restartButton.addEventListener("click", reset);
  previousButton.addEventListener("click", goBack);

  fetch(configPath)
    .then(function (response) {
      if (!response.ok) throw new Error("Não foi possível carregar os cenários.");
      return response.json();
    })
    .then(function (data) {
      config = data;
      state = newState();
      currentView = renderSetup;
      renderSetup();
      updateNavigationButtons();
    })
    .catch(function () {
      screen.innerHTML = '<div class="screen-body"><div class="panel panel-danger"><strong>O treinamento não pôde ser carregado.</strong><p>Atualize a página. Se o problema continuar, avise a CCA.</p></div></div>';
    });
})();
