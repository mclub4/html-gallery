(() => {
  const gallery = window.HTMLPPTGallery;
  if (!gallery) return;

  const album = document.querySelector("#deckAlbum");
  const guideContainer = document.querySelector("#guideDeck");
  const featuredContainer = document.querySelector("#featuredDecks");
  const searchInput = document.querySelector("#deckSearch");
  const sortSelect = document.querySelector("#deckSort");
  const resetButton = document.querySelector("#resetFilters");
  const resultCount = document.querySelector("#resultCount");
  const topicButtons = [...document.querySelectorAll("[data-topic-filter]")];
  const shareButton = document.querySelector("#shareDeck");
  const shareFeedback = document.querySelector("#shareFeedback");
  const notesToggle = document.querySelector("#notesToggle");
  const guideOpen = document.querySelector("#guideOpen");
  const notesPanel = document.querySelector("#speakerNotes");
  const notesClose = document.querySelector("#notesClose");
  const notesTitle = document.querySelector("#notesTitle");
  const notesPosition = document.querySelector("#notesPosition");
  const notesBody = document.querySelector("#notesBody");
  const notesPrev = document.querySelector("#notesPrev");
  const notesNext = document.querySelector("#notesNext");
  const cardBySlug = new Map(
    [...album.querySelectorAll(".deck-card")].map((card) => [
      card.dataset.deck,
      card,
    ]),
  );
  const archiveDecks = gallery.deckList.filter((deck) => !deck.manual);
  const curatedIndex = new Map(
    gallery.deckList.map((deck, index) => [deck.slug, index]),
  );
  const topics = {
    all: null,
    travel: new Set(["여행"]),
    sports: new Set(["스포츠", "건강"]),
    technology: new Set(["기술 · 연구"]),
    business: new Set(["비즈니스 · 프로세스"]),
    culture: new Set(["문화 · 음식 · 예술", "음악 · 공연"]),
    design: new Set(["디자인 · 시나리오"]),
    game: new Set(["게임"]),
  };
  const modelRank = new Map(
    [
      "extra-high",
      "ultra",
      "high",
      "terra-high",
      "medium",
      "terra-medium",
      "low",
      "terra-low",
      "claude",
    ].map((tier, index) => [tier, index]),
  );
  const defaultMeta = {
    title: document.title,
    description: document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content"),
    image: document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content"),
    url: location.origin + "/",
  };
  let activeTopic = "all";
  let feedbackTimer = 0;
  let notesObserver = null;
  let notesFrame = null;
  let notesSlug = null;
  let notesSections = [];
  let notesRequest = 0;
  const notesCache = new Map();

  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko")
      .replace(/\s+/g, " ")
      .trim();

  const featuredSelections = [
    ["japan-travel-guide", "여덟 지방을 한 권의 여행 매거진처럼 엮은 대표 장편."],
    ["msa-production-playbook", "복잡한 운영 아키텍처를 발표 흐름으로 바꾼 기술 덱."],
    ["world-street-food", "63가지 음식을 사진과 지역의 리듬으로 훑는 푸드 아틀라스."],
    ["ai-art-debate", "찬반을 강요하지 않고 스스로 판단할 기준을 남기는 토론형 덱."],
    ["rescene-meme-guide", "밈에서 음악과 멤버의 매력으로 자연스럽게 이어지는 K-POP 프로모션 덱."],
    ["zelda-mainline-deck", "40년의 메인라인을 한 흐름으로 압축한 게임 타임라인."],
  ];

  function renderFeaturedDecks() {
    if (!featuredContainer) return;
    featuredContainer.innerHTML = featuredSelections
      .map(([slug, note], index) => {
        const deck = gallery.decks[slug];
        if (!deck) return "";
        return `<a class="featured-card" href="${gallery.shareUrlFor(slug)}" data-featured-deck="${slug}">
          <span class="featured-media">
            <img src="${gallery.coverUrlFor(deck)}" alt="${deck.title} 표지" loading="${index < 3 ? "eager" : "lazy"}" decoding="async">
            <b class="featured-rank">${String(index + 1).padStart(2, "0")}</b>
            <span class="featured-model">${deck.modelLabel}</span>
          </span>
          <span class="featured-meta">${deck.topic} · ${deck.kind}</span>
          <h4>${deck.title}</h4>
          <p>${note}</p>
          <span class="featured-open">OPEN DECK</span>
        </a>`;
      })
      .join("");
  }

  function parseNotes(markdown) {
    const sections = [];
    let current = null;
    for (const rawLine of String(markdown).replace(/\r/g, "").split("\n")) {
      const heading = rawLine.match(/^##\s+(?:\d+[.)]\s*)?(.*)$/);
      if (heading) {
        current = { title: heading[1].trim(), entries: [], paragraphs: [] };
        sections.push(current);
        continue;
      }
      if (!current) continue;
      const bullet = rawLine.match(/^[-*]\s+(?:\*\*)?([^:*]+?)(?:\*\*)?:\s*(.*)$/);
      if (bullet) {
        current.entries.push({ label: bullet[1].trim(), text: bullet[2].trim() });
      } else if (rawLine.trim()) {
        current.paragraphs.push(rawLine.trim().replace(/^[-*]\s+/, ""));
      }
    }
    return sections;
  }

  function activeSlideIndex() {
    try {
      const frame = document.querySelector("#deckFrame");
      const slides = [...(frame?.contentDocument?.querySelectorAll(".slide") || [])];
      const active = slides.findIndex(
        (slide) => slide.classList.contains("active") || slide.getAttribute("aria-hidden") === "false",
      );
      return { index: active < 0 ? 0 : active, total: slides.length };
    } catch {
      return { index: 0, total: gallery.decks[notesSlug]?.slides || notesSections.length };
    }
  }

  function renderCurrentNote() {
    if (!notesSlug || notesPanel.hidden) return;
    const { index, total } = activeSlideIndex();
    const section = notesSections[index];
    notesPrev.disabled = index <= 0;
    notesNext.disabled = !total || index >= total - 1;
    notesPosition.textContent = `SLIDE ${String(index + 1).padStart(2, "0")} / ${String(total || notesSections.length).padStart(2, "0")}`;
    notesTitle.textContent = gallery.decks[notesSlug]?.title || "발표자 노트";
    notesBody.replaceChildren();
    if (!section) {
      const empty = document.createElement("p");
      empty.className = "notes-empty";
      empty.textContent = `${index + 1}번 슬라이드에 작성된 발표자 노트가 없습니다.`;
      notesBody.append(empty);
      return;
    }
    const heading = document.createElement("h3");
    heading.textContent = section.title;
    notesBody.append(heading);
    if (section.entries.length) {
      const list = document.createElement("dl");
      section.entries.forEach(({ label, text }) => {
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = text;
        list.append(term, description);
      });
      notesBody.append(list);
    }
    section.paragraphs.forEach((text) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      notesBody.append(paragraph);
    });
  }

  function bindNotesToFrame() {
    notesObserver?.disconnect();
    notesObserver = null;
    const frame = document.querySelector("#deckFrame");
    if (!frame || frame !== notesFrame) {
      notesFrame = frame;
      frame?.addEventListener("load", bindNotesToFrame, { once: true });
    }
    let slides = [];
    try {
      slides = [...(frame?.contentDocument?.querySelectorAll(".slide") || [])];
    } catch {
      return;
    }
    if (!slides.length) {
      setTimeout(bindNotesToFrame, 120);
      return;
    }
    notesObserver = new MutationObserver(renderCurrentNote);
    slides.forEach((slide) =>
      notesObserver.observe(slide, {
        attributes: true,
        attributeFilter: ["class", "aria-hidden"],
      }),
    );
    renderCurrentNote();
  }

  async function loadNotes(slug) {
    const path = window.HTMLPPTNotes?.[slug];
    if (!path) return [];
    if (!notesCache.has(slug)) {
      notesCache.set(
        slug,
        fetch(`${path}?v=${gallery.decks[slug]?.version || "notes-20260718"}`, { cache: "no-store" })
          .then((response) => {
            if (!response.ok) throw new Error(`Notes fetch failed: ${response.status}`);
            return response.text();
          })
          .then(parseNotes),
      );
    }
    return notesCache.get(slug);
  }

  async function openNotes() {
    const slug = gallery.getCurrentSlug();
    if (!slug || !window.HTMLPPTNotes?.[slug]) return;
    const request = ++notesRequest;
    notesSlug = slug;
    notesPanel.hidden = false;
    notesToggle.setAttribute("aria-expanded", "true");
    notesToggle.setAttribute("aria-label", "발표자 노트 닫기");
    notesPosition.textContent = "NOTES LOADING";
    notesTitle.textContent = gallery.decks[slug].title;
    notesBody.innerHTML = '<p class="notes-empty">발표자 노트를 불러오고 있습니다.</p>';
    try {
      const sections = await loadNotes(slug);
      if (request !== notesRequest || notesSlug !== slug) return;
      notesSections = sections;
      bindNotesToFrame();
      renderCurrentNote();
      notesBody.focus({ preventScroll: true });
    } catch {
      if (request !== notesRequest) return;
      notesBody.innerHTML = '<p class="notes-empty">발표자 노트를 불러오지 못했습니다.</p>';
    }
  }

  function closeNotes({ focus = true } = {}) {
    notesRequest += 1;
    notesObserver?.disconnect();
    notesObserver = null;
    notesPanel.hidden = true;
    notesToggle.setAttribute("aria-expanded", "false");
    notesToggle.setAttribute("aria-label", "발표자 노트 열기");
    if (focus && !notesToggle.hidden) notesToggle.focus({ preventScroll: true });
  }

  function configureNotes(deck) {
    closeNotes({ focus: false });
    notesSlug = deck?.slug || null;
    notesSections = [];
    notesToggle.hidden = !deck || !window.HTMLPPTNotes?.[deck.slug];
  }

  function configureGuide(deck) {
    const href = deck ? window.HTMLPPTGuides?.[deck.slug] : null;
    guideOpen.hidden = !href;
    guideOpen.href = href || "#";
    guideOpen.setAttribute(
      "aria-label",
      href && deck
        ? `${deck.title} 슬라이드 상세 해설을 새 탭에서 열기`
        : "새 탭에서 슬라이드 상세 해설 열기",
    );
  }

  function moveDeckFromNotes(direction) {
    try {
      const documentModel = document.querySelector("#deckFrame")?.contentDocument;
      const control = documentModel?.querySelector(direction < 0 ? "#prev" : "#next");
      if (control instanceof HTMLElement) {
        control.click();
        return;
      }
      documentModel?.defaultView?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: direction < 0 ? "ArrowLeft" : "ArrowRight",
          bubbles: true,
        }),
      );
    } catch {
      // Some independently authored decks expose neither standard controls nor same-origin access.
    }
  }

  const searchableText = (deck) =>
    normalize(
      [
        deck.title,
        deck.description,
        deck.kind,
        deck.topic,
        deck.modelLabel,
        ...deck.tags,
      ].join(" "),
    );

  function sortedDecks(decks) {
    const sorted = [...decks];
    switch (sortSelect.value) {
      case "title":
        return sorted.sort((a, b) => a.title.localeCompare(b.title, "ko"));
      case "slides-asc":
        return sorted.sort(
          (a, b) => a.slides - b.slides || a.title.localeCompare(b.title, "ko"),
        );
      case "slides-desc":
        return sorted.sort(
          (a, b) => b.slides - a.slides || a.title.localeCompare(b.title, "ko"),
        );
      case "model":
        return sorted.sort(
          (a, b) =>
            (modelRank.get(a.model) ?? 99) - (modelRank.get(b.model) ?? 99) ||
            a.title.localeCompare(b.title, "ko"),
        );
      default:
        return sorted.sort(
          (a, b) => curatedIndex.get(a.slug) - curatedIndex.get(b.slug),
        );
    }
  }

  function applyFilters() {
    const query = normalize(searchInput.value);
    const topicSet = topics[activeTopic];
    const filtered = sortedDecks(
      archiveDecks.filter(
        (deck) =>
          (!topicSet || topicSet.has(deck.topic)) &&
          (!query || searchableText(deck).includes(query)),
      ),
    );
    const fragment = document.createDocumentFragment();
    filtered.forEach((deck, index) => {
      const card = cardBySlug.get(deck.slug);
      const displayIndex = deck.manual
        ? 0
        : index + (filtered[0]?.manual ? 0 : 1);
      card.querySelector(".article-no").textContent = String(
        displayIndex,
      ).padStart(2, "0");
      fragment.append(card);
    });
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "album-empty";
      empty.innerHTML =
        "<strong>조건에 맞는 덱이 없습니다.</strong><span>검색어를 줄이거나 전체 주제로 돌아가 보세요.</span>";
      fragment.append(empty);
    }
    album.replaceChildren(fragment);
    resultCount.textContent =
      filtered.length === archiveDecks.length
        ? `${archiveDecks.length}개 전체`
        : `${archiveDecks.length}개 중 ${filtered.length}개`;
    resetButton.disabled =
      activeTopic === "all" && !query && sortSelect.value === "curated";
  }

  function chooseTopic(topic) {
    activeTopic = topic;
    topicButtons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.topicFilter === topic),
      ),
    );
    applyFilters();
    document.querySelector(".gallery-controls")?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  function setMeta(selector, attribute, value) {
    const element = document.querySelector(selector);
    if (element) element.setAttribute(attribute, value);
  }

  function updateDocumentMeta(deck) {
    const meta = deck
      ? {
          title: `${deck.title} — HTML PPT 아카이브`,
          description: deck.description,
          image: gallery.coverUrlFor(deck),
          url: gallery.shareUrlFor(deck.slug),
        }
      : defaultMeta;
    document.title = meta.title;
    setMeta('meta[name="description"]', "content", meta.description);
    setMeta('meta[property="og:title"]', "content", meta.title);
    setMeta('meta[property="og:description"]', "content", meta.description);
    setMeta('meta[property="og:image"]', "content", meta.image);
    setMeta('meta[property="og:url"]', "content", meta.url);
    setMeta('link[rel="canonical"]', "href", meta.url);
  }

  function showFeedback(message) {
    clearTimeout(feedbackTimer);
    shareFeedback.textContent = message;
    shareFeedback.classList.add("visible");
    feedbackTimer = setTimeout(
      () => shareFeedback.classList.remove("visible"),
      2200,
    );
  }

  topicButtons.forEach((button) =>
    button.addEventListener("click", () =>
      chooseTopic(button.dataset.topicFilter),
    ),
  );
  featuredContainer?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-featured-deck]");
    if (!card) return;
    event.preventDefault();
    gallery.showDeck(card.dataset.featuredDeck);
  });
  searchInput.addEventListener("input", applyFilters);
  sortSelect.addEventListener("change", applyFilters);
  resetButton.addEventListener("click", () => {
    searchInput.value = "";
    sortSelect.value = "curated";
    chooseTopic("all");
    searchInput.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")
    ) {
      event.preventDefault();
      searchInput.focus();
    }
  });
  document.addEventListener("gallery:deckchange", (event) => {
    updateDocumentMeta(event.detail.deck);
    configureNotes(event.detail.deck);
    configureGuide(event.detail.deck);
  });
  notesToggle.addEventListener("click", () =>
    notesPanel.hidden ? openNotes() : closeNotes(),
  );
  notesClose.addEventListener("click", () => closeNotes());
  notesPrev.addEventListener("click", () => moveDeckFromNotes(-1));
  notesNext.addEventListener("click", () => moveDeckFromNotes(1));
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && !notesPanel.hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeNotes();
      }
    },
    true,
  );
  shareButton.addEventListener("click", async () => {
    const slug = gallery.getCurrentSlug();
    const deck = gallery.decks[slug];
    if (!deck) return;
    const url = gallery.shareUrlFor(slug);
    try {
      if (navigator.share) {
        await navigator.share({
          title: deck.title,
          text: deck.description,
          url,
        });
        showFeedback("공유 메뉴를 열었습니다.");
      } else {
        await navigator.clipboard.writeText(url);
        showFeedback("덱별 공유 링크를 복사했습니다.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") showFeedback("공유 링크를 복사하지 못했습니다.");
    }
  });

  const initialDeck = gallery.decks[gallery.getCurrentSlug()];
  if (initialDeck) {
    updateDocumentMeta(initialDeck);
    configureNotes(initialDeck);
    configureGuide(initialDeck);
  }
  const manualCard = cardBySlug.get("html-ppt-skill-manual");
  if (guideContainer && manualCard) guideContainer.append(manualCard);
  document.querySelectorAll("[data-archive-count]").forEach((element) => {
    element.textContent = String(archiveDecks.length);
  });
  renderFeaturedDecks();
  applyFilters();
})();
