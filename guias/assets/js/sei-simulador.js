(function () {
  "use strict";

  const screen = document.getElementById("sim-screen");
  const feedbackBox = document.getElementById("global-feedback");
  const progressWrap = document.getElementById("progress-wrap");
  const progressLabel = document.getElementById("progress-label");
  const progressName = document.getElementById("progress-name");
  const progressValue = document.getElementById("progress-value");
  const previousButton = document.getElementById("previous-button");
  const nextButton = document.getElementById("next-button");
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
    ["Outro: ____", "outro"]
  ];

  const PROCESS_TYPES = [
    ["Aluno: Requerimento Geral", "correct"],
    ["Cidadão: Solicitação Geral", "cidadao"],
    ["Extensão: Solicitação de Convênio de Estágio", "convenio-estagio"],
    ["Pessoal: Diárias e Passagens - Usuário Externo", "diarias-passagens"],
    ["Pessoal: Prestações de Contas de Viagem - Usuário Externo", "prestacao-contas"],
    ["Pessoal: Redistribuição - Solicitação Externa", "redistribuicao"],
    ["Pessoal: Servidor do IFCE em Exercício em Outro Órgão", "exercicio-outro-orgao"],
    ["Transferência e Inovação Tecnológica: Registro de Propriedade Intelectual - Patente", "patente"],
    ["Transferência e Inovação Tecnológica: Registro de Propriedade Intelectual - Software", "software"]
  ];

  const PROOF_ITEMS = [
    { key: "login", label: "Acesso para Usuários Externos", points: 3 },
    { key: "petition", label: "Abertura de Processo Novo", points: 3 },
    { key: "process-type", label: "Tipo do processo", points: 4 },
    { key: "specification", label: "Especificação", points: 8 },
    { key: "city", label: "Cidade do campus", points: 7 },
    { key: "request-kind", label: "Opção do requerimento", points: 12 },
    { key: "request-workflow", label: "Salvar e retornar pelo botão de guias", points: 8 },
    { key: "main-access", label: "Nível de acesso", points: 7 },
    { key: "main-hypothesis", label: "Hipótese legal", points: 8 },
    { key: "attachment-form", label: "Formulário de aproveitamento", points: 8 },
    { key: "attachment-history", label: "Histórico escolar", points: 8 },
    { key: "attachment-programs", label: "Programas, PUDs ou ementas", points: 8 },
    { key: "attachments-complete", label: "Conferência de todos os anexos", points: 6 },
    { key: "signature", label: "Peticionamento e assinatura", points: 10 }
  ];

  let config = null;
  let procedure = null;
  let state = null;
  let currentView = null;
  let navigationHistory = [];
  let navigationForward = [];
  let proofTimerInterval = null;

  function newState() {
    return {
      mode: "guiado",
      packaging: "unico",
      proofMinutes: 0,
      proofStartedAt: 0,
      proofEndedAt: 0,
      proofAttempts: {},
      proofCompleted: new Set(),
      proofEndReason: "",
      proofCriticalDetail: "",
      step: 0,
      specification: "",
      requestSaved: false,
      requestKind: "",
      requestDetail: "",
      selectedFile: null,
      filePickerOpen: false,
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

  function isProof() {
    return state && state.mode === "prova";
  }

  function proofItemKeyForDocument(doc) {
    if (doc.id.includes("historico")) return "attachment-history";
    if (doc.id.includes("programa") || doc.id.includes("pud") || doc.id.includes("ementa")) return "attachment-programs";
    return "attachment-form";
  }

  function markProofComplete(key) {
    if (isProof()) state.proofCompleted.add(key);
  }

  function proofMistake(key, firstHint, correctAnswer, guidedMessage, type) {
    if (!isProof()) {
      recordIssue(guidedMessage.replace(/<[^>]+>/g, ""));
      showFeedback(guidedMessage, type || "error");
      return;
    }
    state.proofAttempts[key] = (state.proofAttempts[key] || 0) + 1;
    const attempt = state.proofAttempts[key];
    if (attempt === 1) {
      showFeedback("<strong>Primeira tentativa incorreta.</strong> " + firstHint, type || "error");
      return;
    }
    showFeedback("<strong>Correção:</strong> " + correctAnswer, type || "error");
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function proofElapsedMs() {
    if (!state.proofStartedAt) return 0;
    return (state.proofEndedAt || Date.now()) - state.proofStartedAt;
  }

  function proofRemainingMs() {
    if (!state.proofMinutes || !state.proofStartedAt) return 0;
    return Math.max(0, (state.proofMinutes * 60000) - proofElapsedMs());
  }

  function proofTimerText() {
    if (!isProof()) return "";
    if (state.proofEndReason) return "Tempo: " + formatDuration(proofElapsedMs());
    return state.proofMinutes ? formatDuration(proofRemainingMs()) : "Sem cronômetro";
  }

  function proofStatusHtml() {
    if (!isProof()) return '<span class="screen-header-mark">CCA · TREINO</span>';
    return '<span class="proof-status"><strong>MODO PROVA</strong><span data-proof-timer>' + proofTimerText() + '</span></span>';
  }

  function updateProofTimerDisplays() {
    if (!isProof() || state.proofEndReason) return;
    document.querySelectorAll("[data-proof-timer]").forEach(function (element) {
      element.textContent = proofTimerText();
    });
    if (state.proofMinutes && proofRemainingMs() <= 0) endProof("tempo", "O tempo escolhido terminou antes da conclusão do peticionamento.");
  }

  function startProofClock() {
    if (!isProof() || state.proofStartedAt) return;
    state.proofStartedAt = Date.now();
    if (proofTimerInterval) window.clearInterval(proofTimerInterval);
    proofTimerInterval = window.setInterval(updateProofTimerDisplays, 1000);
  }

  function stopProofClock() {
    if (isProof() && state.proofStartedAt && !state.proofEndedAt) state.proofEndedAt = Date.now();
    if (proofTimerInterval) window.clearInterval(proofTimerInterval);
    proofTimerInterval = null;
  }

  function endProof(reason, detail) {
    if (!isProof() || state.proofEndReason) return;
    state.proofEndReason = reason;
    state.proofCriticalDetail = detail || "";
    stopProofClock();
    navigationHistory = [];
    navigationForward = [];
    currentView = renderProofResult;
    renderProofResult();
    updateNavigationButtons();
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

  function bindAccessGuidance(accessId, hypothesisId, scopeLabel) {
    const access = document.getElementById(accessId);
    const hypothesis = document.getElementById(hypothesisId);
    const accessMessage = document.getElementById(accessId + "-message");
    const hypothesisMessage = document.getElementById(hypothesisId + "-message");

    access.addEventListener("change", function () {
      if (state.mode !== "guiado") return;
      if (access.value === "publico") {
        recordIssue("Selecionou Público em " + scopeLabel);
        accessMessage.hidden = false;
        accessMessage.innerHTML = "<strong>Atenção:</strong> Público exporia dados pessoais. Volte ao seletor e escolha <strong>Restrito</strong>.";
        access.classList.add("is-invalid");
        return;
      }
      accessMessage.hidden = true;
      accessMessage.textContent = "";
      access.classList.remove("is-invalid");
    });

    hypothesis.addEventListener("change", function () {
      if (state.mode !== "guiado") return;
      if (hypothesis.value && hypothesis.value !== "pessoal") {
        recordIssue("Selecionou hipótese legal incompatível em " + scopeLabel);
        hypothesisMessage.hidden = false;
        hypothesisMessage.innerHTML = "<strong>Essa hipótese não corresponde aos dados do requerimento.</strong> Volte ao seletor e escolha <strong>Informação Pessoal</strong>.";
        hypothesis.classList.add("is-invalid");
        return;
      }
      hypothesisMessage.hidden = true;
      hypothesisMessage.textContent = "";
      hypothesis.classList.remove("is-invalid");
    });
  }

  function updateFormatGuidance(doc) {
    const format = screen.querySelector('input[name="attachment-format"]:checked');
    const message = document.getElementById("attachment-format-message");
    if (!format || state.mode !== "guiado") {
      message.hidden = true;
      message.textContent = "";
      return;
    }
    if (format.value !== doc.correctFormat) {
      const expected = doc.correctFormat === "digitalizado" ? "Digitalizado" : "Nato-digital";
      const explanation = doc.correctFormat === "digitalizado"
        ? "A descrição informa que o original existia em papel e foi escaneado."
        : "A descrição informa que o arquivo foi emitido diretamente em PDF e não passou por scanner.";
      recordIssue("Selecionou formato incongruente para " + doc.fileName);
      message.hidden = false;
      message.innerHTML = "<strong>A escolha ficou incongruente.</strong> " + explanation + " Volte e selecione <strong>" + expected + "</strong>.";
      return;
    }
    message.hidden = true;
    message.textContent = "";
  }

  function bindConferenceGuidance() {
    const conference = document.getElementById("attachment-conference");
    const message = document.getElementById("attachment-conference-message");
    conference.addEventListener("change", function () {
      if (state.mode !== "guiado") return;
      if (conference.value && conference.value !== "copia-simples") {
        recordIssue("Selecionou conferência diferente de Cópia simples");
        message.hidden = false;
        message.innerHTML = "<strong>Essa conferência não corresponde ao exercício.</strong> Volte ao seletor e escolha <strong>Cópia simples</strong>.";
        conference.classList.add("is-invalid");
        return;
      }
      message.hidden = true;
      message.textContent = "";
      conference.classList.remove("is-invalid");
    });
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
    nextButton.hidden = navigationForward.length === 0;
  }

  function navigate(renderFunction) {
    if (currentView && currentView !== renderFunction) navigationHistory.push(currentView);
    navigationForward = [];
    currentView = renderFunction;
    renderFunction();
    updateNavigationButtons();
  }

  function goBack() {
    if (!navigationHistory.length) return;
    if (currentView) navigationForward.push(currentView);
    currentView = navigationHistory.pop();
    currentView();
    updateNavigationButtons();
  }

  function goForward() {
    if (!navigationForward.length) return;
    if (currentView) navigationHistory.push(currentView);
    currentView = navigationForward.pop();
    currentView();
    updateNavigationButtons();
  }

  function invalidateForwardNavigation() {
    if (!navigationForward.length) return;
    navigationForward = [];
    updateNavigationButtons();
  }

  function screenHeader(title, subtitle, actionHtml) {
    const action = actionHtml || proofStatusHtml();
    const proofWithAction = actionHtml && isProof() ? proofStatusHtml() : "";
    return `<div class="screen-header"><div class="screen-header-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle || "Ambiente simulado")}</span></div><div class="screen-header-action">${proofWithAction}${action}</div></div>`;
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
            <option ${procedure && procedure.id === "aproveitamento-disciplinas" ? "selected" : ""} value="aproveitamento-disciplinas">Aproveitamento de disciplinas</option>
          </select>
        </div>
        <fieldset class="field">
          <legend>Como deseja treinar?</legend>
          <div class="choice-list">
            <label class="choice" for="mode-guided">
              <input ${state.mode === "guiado" ? "checked" : ""} id="mode-guided" name="mode" type="radio" value="guiado"/>
              <span><strong>Modo guiado</strong><span>Mostra orientações antes das decisões mais importantes.</span></span>
            </label>
            <label class="choice" for="mode-proof">
              <input ${state.mode === "prova" ? "checked" : ""} id="mode-proof" name="mode" type="radio" value="prova"/>
              <span><strong>Modo prova</strong><span>Primeiro erro: uma pista. Segundo erro: a correção. Você recebe nota e diagnóstico ao final.</span></span>
            </label>
          </div>
        </fieldset>
        <fieldset class="field" id="proof-time-field" ${state.mode === "prova" ? "" : "hidden"}>
          <legend>Tempo da prova</legend>
          <div class="choice-list">
            <label class="choice" for="proof-time-none"><input ${state.proofMinutes === 0 ? "checked" : ""} id="proof-time-none" name="proof-time" type="radio" value="0"/><span><strong>Sem cronômetro</strong><span>O tempo será registrado, mas não alterará a nota.</span></span></label>
            <label class="choice" for="proof-time-10"><input ${state.proofMinutes === 10 ? "checked" : ""} id="proof-time-10" name="proof-time" type="radio" value="10"/><span><strong>10 minutos — desafio</strong><span>O bônus depende da rapidez da conclusão.</span></span></label>
            <label class="choice" for="proof-time-15"><input ${state.proofMinutes === 15 ? "checked" : ""} id="proof-time-15" name="proof-time" type="radio" value="15"/><span><strong>15 minutos — recomendado</strong><span>Equilíbrio entre atenção e agilidade.</span></span></label>
            <label class="choice" for="proof-time-20"><input ${state.proofMinutes === 20 ? "checked" : ""} id="proof-time-20" name="proof-time" type="radio" value="20"/><span><strong>20 minutos — tranquilo</strong><span>Mais tempo para conferir cada etapa.</span></span></label>
          </div>
          <p class="field-help">O cronômetro começa somente depois da preparação dos documentos.</p>
        </fieldset>
        <fieldset class="field">
          <legend>Como os programas, PUDs ou ementas serão organizados?</legend>
          <div class="choice-list">
            <label class="choice" for="package-one">
              <input ${state.packaging === "unico" ? "checked" : ""} id="package-one" name="packaging" type="radio" value="unico"/>
              <span><strong>Um único PDF — recomendado</strong><span>Facilita a conferência quando há muitos componentes. O arquivo deve permanecer com até 10 MB.</span></span>
            </label>
            <label class="choice" for="package-many">
              <input ${state.packaging === "separados" ? "checked" : ""} id="package-many" name="packaging" type="radio" value="separados"/>
              <span><strong>PDFs separados</strong><span>Cada programa, PUD ou ementa será adicionado individualmente.</span></span>
            </label>
          </div>
        </fieldset>
        <div class="button-row">
          <button class="sim-button sim-button-primary" id="setup-continue" type="button">Conferir documentos antes de começar</button>
        </div>
      </div>`;

    document.querySelectorAll('input[name="mode"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        document.getElementById("proof-time-field").hidden = radio.value !== "prova";
      });
    });

    document.getElementById("setup-continue").addEventListener("click", function () {
      const selected = document.getElementById("procedure-select").value;
      if (!selected) {
        showFeedback("Selecione a solicitação que deseja treinar.", "error");
        return;
      }
      procedure = config.procedures.find(function (item) { return item.id === selected; });
      state.mode = document.querySelector('input[name="mode"]:checked').value;
      state.packaging = document.querySelector('input[name="packaging"]:checked').value;
      state.proofMinutes = state.mode === "prova" ? Number(document.querySelector('input[name="proof-time"]:checked').value) : 0;
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
          <span><strong>Entendi e preparei os documentos obrigatórios</strong><span>Nenhum arquivo real será selecionado neste site.</span></span>
        </label>
        <div class="button-row">
          <button class="sim-button sim-button-primary" id="preflight-start" type="button">${isProof() ? "Iniciar prova" : "Iniciar treinamento"}</button>
        </div>
      </div>`;

    document.getElementById("preflight-start").addEventListener("click", function () {
      if (!document.getElementById("preflight-confirm").checked) {
        recordIssue("Tentou iniciar sem confirmar a preparação dos documentos");
        showFeedback("Confirme a preparação antes de entrar no SEI simulado.", "error");
        return;
      }
      startProofClock();
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
          <span class="avatar student-avatar" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <circle cx="24" cy="18" r="9"></circle>
              <path d="M10 43c1.5-9 6.5-14 14-14s12.5 5 14 14"></path>
              <rect height="7" rx="2" width="10" x="13" y="15"></rect>
              <rect height="7" rx="2" width="10" x="25" y="15"></rect>
              <path d="M23 18.5h2M16 12l3-3 5 2 5-2 3 3"></path>
            </svg>
          </span>
          <div><strong>Fulano de Tal</strong><span>Identidade fictícia · nenhuma senha será solicitada</span></div>
        </div>
      </div>`;

    screen.querySelectorAll("[data-login]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.login === "externo") {
          markProofComplete("login");
          navigate(renderHome);
          return;
        }
        proofMistake(
          "login",
          "Fulano de Tal é estudante e não servidor. Compare a descrição das duas áreas.",
          "Escolha <strong>Acesso para Usuários Externos</strong>.",
          "Essa área é destinada a servidores. Para esta missão, escolha <strong>Acesso para Usuários Externos</strong>."
        );
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
          markProofComplete("petition");
          navigate(renderType);
          return;
        }
        proofMistake(
          "petition",
          "A missão começa do zero; ainda não existe número de processo.",
          "Escolha <strong>Processo Novo</strong>. Peticionamento Intercorrente serve para acrescentar documentos a processo já existente.",
          "<strong>Peticionamento Intercorrente é uma opção válida, mas não para esta missão.</strong> Ele serve para anexar documentos a um processo que já foi criado, inclusive documentos esquecidos ou complementares. Para começar do zero, use <strong>Processo Novo</strong>.",
          "warning"
        );
      });
    });
  }

  function renderType() {
    setStep(3);
    screen.innerHTML = screenHeader("Peticionamento — Processo Novo", "Escolha o tipo") + `
      <div class="screen-body">
        <div class="field">
          <label for="process-type-filter">Tipo do Processo:</label>
          <input aria-describedby="process-type-filter-help" id="process-type-filter" readonly type="text"/>
          <span class="field-help" id="process-type-filter-help">Neste treinamento, não digite neste campo: escolha uma opção na lista abaixo.</span>
        </div>
        <div class="field">
          <label for="process-type-uf">UF:</label>
          <select id="process-type-uf"><option>Todos</option></select>
        </div>
        <h3 class="screen-title">Escolha o Tipo do Processo que deseja iniciar:</h3>
        <p class="screen-subtitle">Missão: ${escapeHtml(procedure.label)}.</p>
        ${hint("Tipo usado pela CCA", "Para esta solicitação, escolha Aluno: Requerimento Geral.", "sei-abrir-solicitacao-celular.html#tipo-processo")}
        <div class="sei-process-type-list" id="process-type-list">
          ${PROCESS_TYPES.map(function (item) {
            return `<button data-label="${escapeHtml(normalize(item[0]))}" data-type="${item[1]}" type="button">${escapeHtml(item[0])}</button>`;
          }).join("")}
        </div>
      </div>`;

    screen.querySelectorAll("[data-type]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.type === "correct") {
          markProofComplete("process-type");
          navigate(renderInitialData);
          return;
        }
        proofMistake(
          "process-type",
          "A solicitação é acadêmica e feita por um estudante. Procure um tipo iniciado por “Aluno”.",
          "Escolha <strong>Aluno: Requerimento Geral</strong>.",
          "Esse tipo não corresponde à solicitação de um estudante. Procure <strong>Aluno: Requerimento Geral</strong>."
        );
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
        <div class="sei-interested-field"><strong>Interessado:</strong><span>Fulano de Tal</span></div>
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
        proofMistake(
          "specification",
          "Use uma identificação curta da solicitação, sem justificativas ou explicações.",
          "Use <strong>Aproveitamento de disciplinas</strong> ou uma das variações aceitas pela CCA.",
          "Use somente o nome da solicitação. Recomendação: <strong>Aproveitamento de disciplinas</strong>."
        );
        return;
      }
      if (city !== procedure.city) {
        markProofComplete("specification");
        proofMistake(
          "city",
          "A cidade corresponde ao campus responsável pelo processo, não ao município onde o estudante mora.",
          "Selecione <strong>Baturité</strong>.",
          "Selecione <strong>Baturité</strong>, cidade do campus responsável pelo processo."
        );
        return;
      }
      markProofComplete("specification");
      markProofComplete("city");
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
      ? '<div class="panel panel-success"><strong>Requerimento Geral Discente salvo.</strong><p>Retorne ao peticionamento pelo botão de guias do navegador.</p></div>'
      : '<p class="screen-subtitle">O documento principal abre em outra guia do navegador.</p>';
    screen.innerHTML = screenHeader("Documentos", "Peticionamento principal") + `
      <div class="screen-body">
        <h3 class="screen-title">Requerimento Geral Discente</h3>
        ${status}
        ${hint("Dois formulários diferentes", "Este é o documento principal interno do SEI. O Formulário de Aproveitamento preenchido e assinado será anexado depois como PDF complementar.", "sei-abrir-solicitacao-celular.html#requerimento")}
        <button class="option-button" id="open-request" type="button"><strong>Documento Principal - Requerimento Geral Discente</strong><small>Clique aqui para editar o conteúdo</small></button>
        ${state.requestSaved ? '<div class="button-row"><button class="sim-button sim-button-primary" id="request-continue" type="button">Definir nível de acesso</button></div>' : ""}
      </div>`;

    document.getElementById("open-request").addEventListener("click", function () { navigate(renderRequestTab); });
    const continueButton = document.getElementById("request-continue");
    if (continueButton) continueButton.addEventListener("click", function () {
      markProofComplete("request-workflow");
      navigate(renderMainAccess);
    });
  }

  function renderRequestTab() {
    setStep(5);
    const selectedRequest = state.requestKind;
    const browserLeading = isProof()
      ? '<button aria-label="Voltar do navegador" class="browser-back-button" id="browser-back-button" type="button">‹</button>'
      : '<span class="browser-home" aria-hidden="true">⌂</span>';
    screen.innerHTML = `
      ${isProof() ? '<div class="proof-exam-strip"><strong>MODO PROVA</strong><span data-proof-timer>' + proofTimerText() + '</span></div>' : ""}
      <div class="mobile-browser-bar" aria-label="Barra simulada do navegador do celular">
        ${browserLeading}
        <div class="browser-address"><span aria-hidden="true">⌘</span><span>sei.ifce.edu.br/sei/controlador…</span></div>
        <span class="browser-plus" aria-hidden="true">＋</span>
        <button aria-label="Abrir o botão de guias; duas guias abertas" class="browser-tabs-button${state.requestSaved ? " is-next" : ""}" id="browser-tabs-button" type="button"><span>2</span></button>
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
        <div aria-live="polite" class="editor-save-notice" id="editor-save-notice" ${state.requestSaved ? "" : "hidden"}>Documento salvo. Toque no <strong>botão de guias</strong>, no canto superior direito — é o quadrado que mostra o número de guias abertas — e escolha a guia do peticionamento.</div>
        <div class="request-scroll-instruction"><strong>Deslize para o lado</strong><span>Use a barra abaixo para ver todo o formulário.</span></div>
        <div aria-label="Rolagem horizontal superior do requerimento" class="sei-document-scroll-top" id="request-scroll-top"><div></div></div>
        <div class="sei-document-scroll" id="request-scroll-main">
          <div class="sei-document-sheet">
            <section class="sei-document-section" aria-labelledby="basic-data-title">
              <h3 id="basic-data-title">DADOS BÁSICOS DO INTERESSADO</h3>
              <div class="sei-data-split"><div><strong>Nome do Discente:</strong> Fulano de Tal</div><div><strong>CPF:</strong> XXX.XXX.XXX-XX</div></div>
              <div class="sei-data-line"><strong>Nome Social (opcional, identidade de gênero):</strong></div>
              <div class="sei-data-grid sei-data-grid-three"><div><strong>Matrícula:</strong> 20251154000000</div><div><strong>E-mail:</strong> fulanodetal@gmail.com</div><div><strong>Telefone:</strong> (85) 9XXXX-XXXX</div></div>
              <div class="sei-data-grid"><div><strong>Curso:</strong> Letras</div><div><strong>Campus:</strong> Baturité</div></div>
            </section>
            <fieldset class="sei-request-section">
              <legend>SOLICITO</legend>
              <div class="sei-request-options">
                <div class="sei-request-column">
                  ${REQUEST_OPTIONS.slice(0, 6).map(function (item) {
                    return `<label><input ${selectedRequest === item[1] ? "checked" : ""} name="request-kind" type="radio" value="${escapeHtml(item[1])}"/><span>${escapeHtml(item[0])}</span></label>`;
                  }).join("")}
                </div>
                <div class="sei-request-column">
                  ${REQUEST_OPTIONS.slice(6).map(function (item) {
                    return `<label><input ${selectedRequest === item[1] ? "checked" : ""} name="request-kind" type="radio" value="${escapeHtml(item[1])}"/><span>${escapeHtml(item[0])}</span></label>`;
                  }).join("")}
                </div>
              </div>
              <div aria-live="polite" class="request-choice-feedback" id="request-choice-feedback"></div>
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

    const browserBackButton = document.getElementById("browser-back-button");
    if (browserBackButton) browserBackButton.addEventListener("click", showBrowserBackConfirmation);

    const topScroll = document.getElementById("request-scroll-top");
    const mainScroll = document.getElementById("request-scroll-main");
    topScroll.addEventListener("scroll", function () {
      if (mainScroll.scrollLeft !== topScroll.scrollLeft) mainScroll.scrollLeft = topScroll.scrollLeft;
    });
    mainScroll.addEventListener("scroll", function () {
      if (topScroll.scrollLeft !== mainScroll.scrollLeft) topScroll.scrollLeft = mainScroll.scrollLeft;
    });

    screen.querySelectorAll('input[name="request-kind"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        state.requestKind = radio.value;
        const feedback = document.getElementById("request-choice-feedback");
        const saveButton = document.getElementById("request-save");
        if (state.mode !== "guiado") {
          feedback.className = "request-choice-feedback";
          feedback.textContent = "";
          saveButton.classList.remove("is-next");
          return;
        }
        if (radio.value === "aproveitamento") {
          feedback.className = "request-choice-feedback is-correct";
          feedback.innerHTML = "Opção correta. Agora toque em <strong>Salvar</strong>, no canto superior esquerdo.";
          saveButton.classList.add("is-next");
          saveButton.setAttribute("aria-label", "Opção correta selecionada. Salvar documento");
        } else {
          feedback.className = "request-choice-feedback is-question";
          feedback.innerHTML = "<strong>É essa opção mesmo?</strong> Para solicitar aproveitamento, reveja a opção marcada.";
          saveButton.classList.remove("is-next");
        }
      });
    });

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
        proofMistake(
          "request-kind",
          "A opção deve corresponder à missão informada no início da prova.",
          "Em <strong>Solicito</strong>, escolha <strong>Aproveitamento de disciplina(s)</strong>.",
          "Em <strong>Solicito</strong>, escolha <strong>Aproveitamento de disciplina(s)</strong>."
        );
        return;
      }
      markProofComplete("request-kind");
      state.requestKind = kind;
      state.requestDetail = detail;
      state.requestSaved = true;
      const saveButton = document.getElementById("request-save");
      saveButton.classList.remove("is-next");
      saveButton.classList.add("is-saved");
      saveButton.innerHTML = '<span aria-hidden="true">✓</span>Salvo';
      document.getElementById("editor-save-notice").hidden = false;
      document.getElementById("browser-tabs-button").classList.add("is-next");
      document.getElementById("browser-tabs-button").setAttribute("aria-label", "Documento salvo. Abrir o botão de guias; duas guias abertas");
      showFeedback("Requerimento salvo. Agora toque no <strong>botão de guias</strong>, no canto superior direito — é o quadrado que mostra o número de guias abertas.", "success");
    });
  }

  function showBrowserBackConfirmation() {
    const existing = document.getElementById("browser-back-confirmation");
    if (existing) return;
    const confirmation = document.createElement("div");
    confirmation.id = "browser-back-confirmation";
    confirmation.innerHTML = `
      <div class="critical-backdrop" aria-hidden="true"></div>
      <section aria-labelledby="critical-back-title" aria-modal="true" class="critical-back-modal" role="dialog">
        <h3 id="critical-back-title">Usar o Voltar do navegador?</h3>
        <p>No SEI real, esta ação pode fazer você perder o preenchimento do requerimento.</p>
        <p><strong>Cancelar</strong> preserva a prova. Confirmar <strong>Usar Voltar</strong> encerra esta tentativa como erro crítico.</p>
        <div class="critical-back-actions">
          <button id="cancel-browser-back" type="button">Cancelar</button>
          <button id="confirm-browser-back" type="button">Usar Voltar</button>
        </div>
      </section>`;
    screen.appendChild(confirmation);
    document.getElementById("cancel-browser-back").addEventListener("click", function () {
      confirmation.remove();
      document.getElementById("browser-back-button").focus();
    });
    document.getElementById("confirm-browser-back").addEventListener("click", function () {
      endProof("critico", "Foi usado o botão Voltar do navegador na tela do Requerimento Geral Discente.");
    });
    document.getElementById("cancel-browser-back").focus();
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
          <p class="field-error" id="main-access-message" hidden></p>
        </div>
        <div class="field">
          <label for="main-hypothesis">Hipótese legal</label>
          <select id="main-hypothesis">
            <option value="">Selecione…</option>
            <option value="direito-autoral">Direito Autoral (Art. 24, III, da Lei nº 9.610/1998)</option>
            <option value="pessoal">Informação Pessoal (Art. 31 da Lei nº 12.527/2011)</option>
            <option value="software">Proteção da Propriedade Intelectual de Software (Art. 2º da Lei nº 9.609/1998)</option>
            <option value="segredo-industrial">Segredo Industrial (Art. 195, XIV, Lei nº 9.279/1996)</option>
          </select>
          <p class="field-error" id="main-hypothesis-message" hidden></p>
        </div>
        <div class="button-row">
          <button class="sim-button sim-button-primary" id="main-access-continue" type="button">Ir para os anexos</button>
        </div>
      </div>`;

    bindAccessGuidance("main-access", "main-hypothesis", "o documento principal");

    document.getElementById("main-access-continue").addEventListener("click", function () {
      if (document.getElementById("main-access").value !== "restrito") {
        proofMistake(
          "main-access",
          "O requerimento contém dados pessoais do estudante e não deve ficar disponível publicamente.",
          "Selecione o nível de acesso <strong>Restrito</strong>.",
          "Use <strong>Restrito</strong> e <strong>Informação Pessoal</strong> no documento principal."
        );
        return;
      }
      markProofComplete("main-access");
      if (document.getElementById("main-hypothesis").value !== "pessoal") {
        proofMistake(
          "main-hypothesis",
          "Procure a hipótese relacionada aos dados de uma pessoa física.",
          "Selecione <strong>Informação Pessoal</strong>.",
          "Use <strong>Restrito</strong> e <strong>Informação Pessoal</strong> no documento principal."
        );
        return;
      }
      markProofComplete("main-hypothesis");
      navigate(renderAttachments);
    });
  }

  function renderAttachments() {
    setStep(7);
    const docs = requiredDocs();
    const pending = docs.filter(function (doc) { return !state.docsAdded.some(function (added) { return added.id === doc.id; }); });
    const selected = docs.find(function (doc) { return doc.id === state.selectedFile; });
    const filePickerHtml = state.filePickerOpen ? `
      <div class="training-file-picker-backdrop" aria-hidden="true"></div>
      <section aria-labelledby="training-file-picker-title" aria-modal="true" class="training-file-picker" id="training-file-picker" role="dialog">
        <div class="training-file-picker-titlebar">
          <span aria-hidden="true" class="training-folder-icon">▰</span>
          <span><strong id="training-file-picker-title">Arquivos de treinamento</strong><small>Selecione um PDF fictício</small></span>
          <button aria-label="Fechar seleção de arquivos" id="close-training-file-picker" type="button">×</button>
        </div>
        <div class="training-file-picker-path"><span aria-hidden="true">‹</span><strong>Documentos obrigatórios</strong></div>
        <div class="training-file-list">
          ${docs.map(function (doc, index) {
            const wasAdded = state.docsAdded.some(function (added) { return added.id === doc.id; });
            return `<button class="training-file-option" data-file="${escapeHtml(doc.id)}" ${wasAdded ? "disabled" : ""} type="button">
              <span class="training-file-number">${index + 1}</span>
              <span aria-hidden="true" class="training-pdf-icon">PDF</span>
              <span class="training-file-copy"><strong>${escapeHtml(doc.fileName)}</strong><small>Documento ${index + 1} · ${escapeHtml(doc.size)}</small></span>
              <span class="training-file-status">${wasAdded ? "Adicionado" : "Selecionar"}</span>
            </button>`;
          }).join("")}
        </div>
        <div class="training-file-picker-actions">
          <button id="cancel-training-file-picker" type="button">Cancelar</button>
        </div>
      </section>` : "";
    const addedHtml = state.docsAdded.length ? state.docsAdded.map(function (doc) {
      return `<tr>
        <td>${doc.order}</td>
        <td>${escapeHtml(doc.fileName)}</td>
        <td>${escapeHtml(doc.date)}</td>
        <td>${escapeHtml(doc.size)}</td>
        <td>Anexo ${escapeHtml(doc.complement)}</td>
        <td>Restrito<br/><small>Informação Pessoal</small></td>
        <td>${escapeHtml(doc.formatLabel)}</td>
      </tr>`;
    }).join("") : '<tr class="empty-row"><td colspan="7">Nenhum documento adicionado.</td></tr>';
    const selectedHtml = selected ? renderAttachmentForm(selected, docs.indexOf(selected) + 1) : "";

    screen.innerHTML = screenHeader("Peticionamento de Processo Novo", "Documentos Complementares") + `
      <div class="screen-body">
        <h3 class="screen-title">Documentos Complementares (10 Mb)</h3>
        <p class="screen-subtitle">Repita o procedimento para cada PDF obrigatório.</p>
        ${hint("Repita para cada PDF", "Tipo Anexo, complemento descritivo, Restrito, Informação Pessoal e formato conforme a origem. Se for digitalizado, use Cópia simples. Finalize em Adicionar.", "sei-abrir-solicitacao-celular.html#adicionar-documento")}
        <div class="sei-upload-field">
          <span class="sei-upload-label">Documento</span>
          <div class="sei-upload-control">
            <button class="sei-file-button" id="choose-fictional-file" type="button">Escolher arquivo</button>
            <span aria-live="polite">${selected ? "Documento " + (docs.indexOf(selected) + 1) + " — " + escapeHtml(selected.fileName) : "Nenhum arquivo escolhido"}</span>
          </div>
          <p>Para sua segurança, escolha um dos PDFs fictícios do exercício.</p>
        </div>
        ${selectedHtml}
        <div class="sei-table-wrap">
          <table class="sei-documents-table">
            <caption>Documentos já adicionados</caption>
            <thead><tr><th>Nº</th><th>Nome do Arquivo</th><th>Data</th><th>Tamanho</th><th>Documento</th><th>Nível de Acesso</th><th>Formato</th></tr></thead>
            <tbody>${addedHtml}</tbody>
          </table>
        </div>
        <div class="button-row">
          <button class="sim-button sim-button-primary" id="finish-attachments" type="button">Conferir anexos e peticionar</button>
        </div>
        <p class="field-help">${pending.length} documento(s) ainda não adicionado(s).</p>
      </div>
      ${filePickerHtml}`;

    document.getElementById("choose-fictional-file").addEventListener("click", function () {
      state.filePickerOpen = true;
      renderAttachments();
      document.getElementById("close-training-file-picker").focus();
    });

    screen.querySelectorAll("[data-file]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.selectedFile = button.dataset.file;
        state.filePickerOpen = false;
        renderAttachments();
      });
    });
    if (state.filePickerOpen) {
      const closeFilePicker = function () {
        state.filePickerOpen = false;
        renderAttachments();
        document.getElementById("choose-fictional-file").focus();
      };
      document.getElementById("close-training-file-picker").addEventListener("click", closeFilePicker);
      document.getElementById("cancel-training-file-picker").addEventListener("click", closeFilePicker);
      document.getElementById("training-file-picker").addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeFilePicker();
      });
    }
    const suggestion = document.getElementById("use-complement");
    if (suggestion) {
      bindAccessGuidance("attachment-access", "attachment-hypothesis", "um documento complementar");
      suggestion.addEventListener("click", function () {
        document.getElementById("attachment-complement").value = selected.complement;
      });
    }
    screen.querySelectorAll('input[name="attachment-format"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        toggleConference();
        updateFormatGuidance(selected);
      });
    });
    if (document.getElementById("attachment-conference")) bindConferenceGuidance();
    const addButton = document.getElementById("add-attachment");
    if (addButton) addButton.addEventListener("click", function () { addAttachment(selected); });
    document.getElementById("finish-attachments").addEventListener("click", function () {
      const missing = docs.filter(function (doc) { return !state.docsAdded.some(function (added) { return added.id === doc.id; }); });
      if (missing.length) {
        const countText = missing.length === 1 ? "Ainda falta 1 PDF." : "Ainda faltam " + missing.length + " PDFs.";
        proofMistake(
          "attachments-complete",
          countText + " Confira a tabela e a lista de documentos obrigatórios.",
          countText + " Toque em <strong>Escolher arquivo</strong>, selecione outro documento e repita o preenchimento até todos aparecerem na tabela.",
          countText + " Toque em <strong>Escolher arquivo</strong>, selecione outro documento e repita o preenchimento até todos aparecerem na tabela."
        );
        return;
      }
      markProofComplete("attachments-complete");
      navigate(renderSignature);
    });
  }

  function renderAttachmentForm(doc, order) {
    return `
      <div class="panel panel-accent" id="attachment-form">
        <h3>Documento ${order} — ${escapeHtml(doc.fileName)}</h3>
        <div class="origin-story"><strong>Como este PDF foi produzido?</strong>${escapeHtml(doc.originStory)}</div>
        <div class="field">
          <label for="attachment-type">Tipo de Documento</label>
          <select id="attachment-type">
            <option value="">Selecione…</option>
            <option value="anexo">Anexo</option>
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
          <p class="field-error" id="attachment-access-message" hidden></p>
        </div>
        <div class="field">
          <label for="attachment-hypothesis">Hipótese legal</label>
          <select id="attachment-hypothesis">
            <option value="">Selecione…</option>
            <option value="direito-autoral">Direito Autoral (Art. 24, III, da Lei nº 9.610/1998)</option>
            <option value="pessoal">Informação Pessoal (Art. 31 da Lei nº 12.527/2011)</option>
            <option value="software">Proteção da Propriedade Intelectual de Software (Art. 2º da Lei nº 9.609/1998)</option>
            <option value="segredo-industrial">Segredo Industrial (Art. 195, XIV, Lei nº 9.279/1996)</option>
          </select>
          <p class="field-error" id="attachment-hypothesis-message" hidden></p>
        </div>
        <fieldset class="field">
          <legend>Formato</legend>
          <div class="choice-list">
            <label class="choice" for="format-native"><input id="format-native" name="attachment-format" type="radio" value="nato-digital"/><span><strong>Nato-digital</strong><span>O documento já nasceu eletrônico.</span></span></label>
            <label class="choice" for="format-scanned"><input id="format-scanned" name="attachment-format" type="radio" value="digitalizado"/><span><strong>Digitalizado</strong><span>Um original em papel virou PDF.</span></span></label>
          </div>
          <p class="field-error" id="attachment-format-message" hidden></p>
        </fieldset>
        <div class="field" id="conference-field" hidden>
          <label for="attachment-conference">Conferência com o documento digitalizado</label>
          <select id="attachment-conference">
            <option value="">Selecione…</option>
            <option value="copia-administrativa">Cópia autenticada administrativamente</option>
            <option value="copia-cartorio">Cópia autenticada por cartório</option>
            <option value="copia-simples">Cópia simples</option>
            <option value="original">Documento original</option>
          </select>
          <p class="field-error" id="attachment-conference-message" hidden></p>
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
      errors.push("Formato = " + (doc.correctFormat === "digitalizado" ? "Digitalizado" : "Nato-digital") + ", conforme a origem descrita");
      recordIssue("Classificou incorretamente a origem de " + doc.fileName);
    }
    if (format === "digitalizado" && conference !== "copia-simples") errors.push("Conferência = Cópia simples");
    if (errors.length) {
      proofMistake(
        proofItemKeyForDocument(doc),
        "Há metadados incompatíveis neste documento. Revise tipo, complemento, acesso, hipótese legal, formato e, quando houver, conferência.",
        "Revise: <strong>" + errors.join("; ") + "</strong>.",
        "Revise: <strong>" + errors.join("; ") + "</strong>."
      );
      return;
    }
    state.docsAdded.push({
      id: doc.id,
      order: requiredDocs().findIndex(function (item) { return item.id === doc.id; }) + 1,
      fileName: doc.fileName,
      complement: complement,
      size: doc.size,
      date: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza" }).format(new Date()),
      formatLabel: format === "digitalizado" ? "Digitalizado — Cópia simples" : "Nato-digital",
      conference: conference
    });
    const proofDocumentKey = proofItemKeyForDocument(doc);
    const sameGroupPending = requiredDocs().filter(function (required) {
      return proofItemKeyForDocument(required) === proofDocumentKey && !state.docsAdded.some(function (added) { return added.id === required.id; });
    });
    if (!sameGroupPending.length) markProofComplete(proofDocumentKey);
    state.selectedFile = null;
    state.filePickerOpen = false;
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
          <div class="sei-footer-actions">
            <button class="sei-compact-button" id="petition-button" type="button">Peticionar</button>
            <button class="sei-compact-button" id="petition-back" type="button">Voltar</button>
          </div>
        </div>`;
      document.getElementById("petition-button").addEventListener("click", function () {
        state.petitionStarted = true;
        renderSignature();
      });
      document.getElementById("petition-back").addEventListener("click", goBack);
      return;
    }

    screen.innerHTML = `
      <div class="signature-backdrop" aria-hidden="true"></div>
      <section aria-labelledby="signature-title" aria-modal="true" class="signature-modal" role="dialog">
        <div class="signature-titlebar"><strong id="signature-title">Concluir Peticionamento - Assinatura Eletrônica</strong><span aria-hidden="true">□ ×</span></div>
        <div class="signature-actions">
          <button class="signature-action-primary" id="sign-button" type="button">✓ Assinar</button>
          <button id="close-signature" type="button">× Fechar</button>
        </div>
        <div class="signature-content">
          <p>Ao assinar eletronicamente, você declara que os dados e documentos apresentados são verdadeiros e assume responsabilidade pelo peticionamento.</p>
          <div class="signature-field"><span>Usuário Externo:</span><strong>Fulano de Tal</strong></div>
          <div class="field">
            <label for="signature-role">Cargo/Função:</label>
            <select id="signature-role">
              <option value="">Selecione…</option>
              <option value="aluna">Aluna</option>
              <option value="aluno">Aluno</option>
            </select>
          </div>
          <div class="field">
            <label for="signature-password">Senha de acesso ao SEI:</label>
            <input aria-describedby="signature-password-help" id="signature-password" readonly type="password" value="treino123"/>
            <p class="field-help" id="signature-password-help">Campo fictício e não editável. No SEI real, digite sua senha apenas em sei.ifce.edu.br.</p>
          </div>
          <div class="signature-training-note"><strong>AMBIENTE DE TREINAMENTO</strong> — nenhuma assinatura real será criada.</div>
        </div>
      </section>`;

    document.getElementById("close-signature").addEventListener("click", function () {
      state.petitionStarted = false;
      renderSignature();
    });

    document.getElementById("sign-button").addEventListener("click", function () {
      const role = document.getElementById("signature-role").value;
      if (role !== "aluno" && role !== "aluna") {
        proofMistake(
          "signature",
          "O signatário fictício é estudante. Revise o campo Cargo/Função.",
          "Escolha <strong>Aluna</strong> ou <strong>Aluno</strong> em Cargo/Função.",
          "Escolha <strong>Aluna</strong> ou <strong>Aluno</strong> em Cargo/Função."
        );
        return;
      }
      markProofComplete("signature");
      stopProofClock();
      if (isProof()) state.proofEndReason = "concluida";
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

  function calculateProofResult() {
    let technical = 0;
    let direct = 0;
    let corrected = 0;
    let repeated = 0;
    PROOF_ITEMS.forEach(function (item) {
      if (!state.proofCompleted.has(item.key)) return;
      const attempts = state.proofAttempts[item.key] || 0;
      const factor = attempts === 0 ? 1 : attempts === 1 ? 0.75 : 0.25;
      technical += item.points * factor;
      if (attempts === 0) direct += 1;
      else if (attempts === 1) corrected += 1;
      else repeated += 1;
    });
    technical = Math.round(technical);
    const elapsed = proofElapsedMs();
    let bonus = 0;
    if (state.proofEndReason === "concluida" && state.proofMinutes) {
      const ratio = elapsed / (state.proofMinutes * 60000);
      if (ratio <= (2 / 3)) bonus = 5;
      else if (ratio <= (5 / 6)) bonus = 3;
      else if (ratio <= 1) bonus = 1;
    }
    const finalScore = Math.min(100, technical + bonus);
    const status = state.proofEndReason === "critico"
      ? "Não concluída por erro crítico"
      : state.proofEndReason === "tempo"
        ? "Tempo esgotado — prova não concluída"
        : finalScore >= 70
          ? "Aprovado"
          : "Recomenda-se novo treinamento";
    const review = PROOF_ITEMS.filter(function (item) {
      return (state.proofAttempts[item.key] || 0) > 0 || !state.proofCompleted.has(item.key);
    }).slice(0, 5);
    return { technical: technical, bonus: bonus, finalScore: finalScore, status: status, direct: direct, corrected: corrected, repeated: repeated, elapsed: elapsed, review: review };
  }

  function proofSummaryHtml(result) {
    const reviewHtml = result.review.length
      ? `<div class="proof-review"><strong>O que revisar</strong><ul>${result.review.map(function (item) { return `<li>${escapeHtml(item.label)}</li>`; }).join("")}</ul></div>`
      : '<div class="panel panel-success"><strong>Nenhum item precisa de revisão.</strong></div>';
    const criticalHtml = state.proofCriticalDetail ? `<div class="panel panel-danger"><strong>Motivo do encerramento</strong><p>${escapeHtml(state.proofCriticalDetail)}</p></div>` : "";
    return `
      <div class="proof-result" data-proof-status="${escapeHtml(state.proofEndReason)}">
        <div class="proof-result-status"><span>Situação</span><strong>${escapeHtml(result.status)}</strong></div>
        <div class="proof-score-grid">
          <div><span>Desempenho técnico</span><strong>${result.technical}/100</strong></div>
          <div><span>Bônus de tempo</span><strong>+${result.bonus}</strong></div>
          <div><span>Nota final</span><strong>${result.finalScore}/100</strong></div>
          <div><span>Percentual</span><strong>${result.finalScore}%</strong></div>
        </div>
        <div class="proof-detail-grid">
          <div><span>Acertos diretos</span><strong>${result.direct}</strong></div>
          <div><span>Após uma pista</span><strong>${result.corrected}</strong></div>
          <div><span>Após correção</span><strong>${result.repeated}</strong></div>
          <div><span>Tempo utilizado</span><strong>${formatDuration(result.elapsed)}</strong></div>
        </div>
        ${criticalHtml}
        ${reviewHtml}
      </div>`;
  }

  function bindProofResultActions() {
    document.getElementById("proof-restart").addEventListener("click", restartProof);
    document.getElementById("proof-guided").addEventListener("click", switchToGuidedMode);
  }

  function proofResultActionsHtml() {
    return `<div class="button-row"><button class="sim-button sim-button-primary" id="proof-restart" type="button">Refazer a prova</button><button class="sim-button sim-button-secondary" id="proof-guided" type="button">Voltar ao modo guiado</button></div>`;
  }

  function renderProofResult() {
    setStep(9);
    previousButton.hidden = true;
    nextButton.hidden = true;
    restartButton.hidden = true;
    const result = calculateProofResult();
    screen.innerHTML = screenHeader("Resultado da prova", "Avaliação encerrada") + `<div class="screen-body"><h3 class="screen-title">${escapeHtml(result.status)}</h3>${proofSummaryHtml(result)}${proofResultActionsHtml()}</div>`;
    bindProofResultActions();
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
    const result = isProof()
      ? proofSummaryHtml(calculateProofResult())
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
        <div class="panel panel-success protocol-email-note">
          <strong>No processo real, confira seu e-mail.</strong>
          <p>Depois que o processo é criado, o <strong>PROTOCOLO-BAT</strong> envia ao e-mail cadastrado uma mensagem de disponibilização de acesso integral ao processo, permitindo acompanhar sua tramitação.</p>
        </div>
        ${result}
        <div class="panel panel-warning">
          <strong>E se um documento for esquecido?</strong>
          <p>Depois que o processo real já existir, o Peticionamento Intercorrente pode ser usado para anexar documentos que faltaram ou acrescentar novos documentos. Esse fluxo receberá treinamento próprio futuramente.</p>
        </div>
        ${isProof() ? proofResultActionsHtml() : '<div class="button-row"><button class="sim-button sim-button-primary" id="receipt-proof-mode" type="button">Fazer o modo prova</button></div>'}
        <div class="button-row">
          <button class="sim-button sim-button-secondary" id="receipt-restart" type="button">Treinar novamente</button>
          <a class="sim-button sim-button-muted" href="sei-abrir-solicitacao-celular.html">Rever o guia do celular</a>
        </div>
        <div class="button-row">
          <a class="sim-button sim-button-primary" href="https://sei.ifce.edu.br/sei/controlador_externo.php?acao=usuario_externo_logar&amp;acao_origem=usuario_externo_enviar_cadastro&amp;id_orgao_acesso_externo=0" rel="noopener noreferrer" target="_blank">Acessar o SEI real — abre nova guia</a>
        </div>
      </div>`;
    document.getElementById("receipt-restart").addEventListener("click", reset);
    if (isProof()) bindProofResultActions();
    const proofModeButton = document.getElementById("receipt-proof-mode");
    if (proofModeButton) proofModeButton.addEventListener("click", startProofMode);
  }

  function startProofMode() {
    const completedProcedure = procedure;
    state = newState();
    state.mode = "prova";
    procedure = completedProcedure;
    navigationHistory = [];
    navigationForward = [];
    currentView = renderSetup;
    renderSetup();
    updateNavigationButtons();
    document.querySelector(".simulator").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function restartProof() {
    const completedProcedure = procedure;
    const packaging = state.packaging;
    const proofMinutes = state.proofMinutes;
    stopProofClock();
    state = newState();
    state.mode = "prova";
    state.packaging = packaging;
    state.proofMinutes = proofMinutes;
    procedure = completedProcedure;
    navigationHistory = [];
    navigationForward = [];
    currentView = renderPreflight;
    renderPreflight();
    updateNavigationButtons();
  }

  function switchToGuidedMode() {
    const completedProcedure = procedure;
    stopProofClock();
    state = newState();
    state.mode = "guiado";
    procedure = completedProcedure;
    navigationHistory = [];
    navigationForward = [];
    currentView = renderSetup;
    renderSetup();
    updateNavigationButtons();
  }

  function reset() {
    stopProofClock();
    state = newState();
    procedure = null;
    navigationHistory = [];
    navigationForward = [];
    currentView = renderSetup;
    renderSetup();
    updateNavigationButtons();
    document.querySelector(".simulator").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  restartButton.addEventListener("click", reset);
  previousButton.addEventListener("click", goBack);
  nextButton.addEventListener("click", goForward);
  screen.addEventListener("input", invalidateForwardNavigation);
  screen.addEventListener("change", invalidateForwardNavigation);

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
