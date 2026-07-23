const suits = ["♣", "♦", "♥", "♠"];
const ranks = [
  { value: 1, label: "A" },
  ...Array.from({ length: 9 }, (_, index) => ({
    value: index + 2,
    label: String(index + 2),
  })),
  { value: 11, label: "J" },
  { value: 12, label: "Q" },
  { value: 13, label: "K" },
];
const playerNames = ["Sen", "Ada", "Efe", "Mina"];

let players = [];
let currentPlayerId = 0;
let dealerId = 0;
let discardedPairs = [];
let gameOver = false;
let isBusy = false;
let rulesOpen = true;
let botTimer = null;
let transitionTimer = null;
let lastActionState = null;

const statusElement = document.querySelector("#status");
const turnLabel = document.querySelector("#turnLabel");
const remainingCardsElement = document.querySelector("#remainingCards");
const discardCountElement = document.querySelector("#discardCount");
const discardPileElement = document.querySelector("#discardPile");
const dealerLabel = document.querySelector("#dealerLabel");
const lastActionElement = document.querySelector("#lastAction");
const pickMarker = document.querySelector("#pickMarker");
const resetButton = document.querySelector("#resetButton");
const helpButton = document.querySelector("#helpButton");
const rulesOverlay = document.querySelector("#rulesOverlay");
const closeRules = document.querySelector("#closeRules");
const resultOverlay = document.querySelector("#resultOverlay");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");
const newRoundButton = document.querySelector("#newRoundButton");

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function createDeck() {
  const deck = suits.flatMap((suit) =>
    ranks.map((rank) => ({ suit, ...rank, id: `${rank.label}-${suit}` })),
  );

  return shuffle(
    deck.filter((card) => card.value !== 13 || card.suit === "♠"),
  );
}

function removeInitialPairs(hand, playerId) {
  const groups = new Map();
  hand.forEach((card) => {
    const group = groups.get(card.value) ?? [];
    group.push(card);
    groups.set(card.value, group);
  });

  const remaining = [];
  groups.forEach((cards) => {
    const randomized = shuffle(cards);
    while (randomized.length >= 2) {
      discardedPairs.push({
        playerId,
        cards: [randomized.pop(), randomized.pop()],
      });
    }
    if (randomized.length === 1) remaining.push(randomized[0]);
  });

  return shuffle(remaining);
}

function activePlayerIds() {
  return players.filter((player) => player.hand.length > 0).map((player) => player.id);
}

function nextActivePlayer(fromPlayerId) {
  for (let step = 1; step <= players.length; step += 1) {
    const candidate = (fromPlayerId + step) % players.length;
    if (players[candidate].hand.length > 0) return candidate;
  }
  return fromPlayerId;
}

function cardLabel(card) {
  return `${card.label}${card.suit}`;
}

function isRed(card) {
  return card.suit === "♦" || card.suit === "♥";
}

function sortHumanHand(hand) {
  return [...hand].sort((first, second) => {
    if (first.value !== second.value) return first.value - second.value;
    return suits.indexOf(first.suit) - suits.indexOf(second.suit);
  });
}

function cardFaceMarkup(card, extraClass = "") {
  return `
    <span
      class="table-card card-face ${isRed(card) ? "is-red" : ""} ${extraClass}"
      data-card="${cardLabel(card)}"
      aria-label="${cardLabel(card)}"
    >
      <span class="card-corner">${card.label}<small>${card.suit}</small></span>
      <b>${card.suit}</b>
      <span class="card-corner card-corner-bottom">${card.label}<small>${card.suit}</small></span>
    </span>
  `;
}

function cardPosition(index, count) {
  const middle = (count - 1) / 2;
  const distance = index - middle;
  const pickGap = Math.min(64, 280 / Math.max(count - 1, 1));
  const pickCardWidth = Math.max(22, Math.min(54, pickGap - 4));
  return `--shift:${distance * 38}px;--mobile-shift:${distance * 27}px;--side-shift:${distance * 30}px;--mobile-side-shift:${distance * 22}px;--pick-shift:${distance * pickGap}px;--pick-card-w:${pickCardWidth}px;--rotation:${distance * 2.8}deg;--counter-rotation:${distance * -2.8}deg;--depth:${index + 1}`;
}

function renderSeat(player) {
  const seat = document.querySelector(`#seat-${player.id}`);
  const handElement = document.querySelector(`#hand-${player.id}`);
  const countElement = document.querySelector(`#count-${player.id}`);
  const isHumanTurn = currentPlayerId === 0 && !gameOver;
  const targetId = isHumanTurn ? nextActivePlayer(0) : -1;

  seat.classList.toggle("is-active", currentPlayerId === player.id && !gameOver);
  seat.classList.toggle("is-target", targetId === player.id && !isBusy);
  seat.classList.toggle("is-out", player.escaped);
  countElement.textContent = player.escaped ? "Kurtuldu" : `${player.hand.length} kart`;

  if (player.hand.length === 0) {
    handElement.innerHTML = '<span class="empty-hand">EL BİTTİ</span>';
    return;
  }

  if (player.id === 0) {
    handElement.innerHTML = player.hand
      .map((card, index) =>
        cardFaceMarkup(
          card,
          "human-card",
        ).replace(
          'class="table-card',
          `style="${cardPosition(index, player.hand.length)}" class="table-card`,
        ),
      )
      .join("");
    return;
  }

  const canPick = targetId === player.id && !isBusy;
  handElement.innerHTML = player.hand
    .map(
      (_, index) => `
        <${canPick ? "button" : "span"}
          class="table-card card-back"
          style="${cardPosition(index, player.hand.length)}"
          ${canPick ? `type="button" data-card-index="${index}" aria-label="${player.name} oyuncusunun ${index + 1}. kapalı kartını çek"` : 'aria-hidden="true"'}
        ></${canPick ? "button" : "span"}>
      `,
    )
    .join("");

  if (canPick) {
    handElement.querySelectorAll("[data-card-index]").forEach((button) => {
      button.addEventListener("click", () => {
        humanTurn(Number(button.dataset.cardIndex));
      });
    });
  }
}

function renderDiscardPile() {
  const latestPair = discardedPairs.at(-1);
  discardCountElement.textContent = discardedPairs.length;
  if (!latestPair) {
    discardPileElement.innerHTML = `
      <span class="discard-placeholder"></span>
      <span class="discard-placeholder"></span>
    `;
    return;
  }

  discardPileElement.innerHTML = latestPair.cards
    .map((card) => cardFaceMarkup(card, "discard-card"))
    .join("");
}

function renderLastAction() {
  if (!lastActionState) {
    lastActionElement.innerHTML = `
      <div class="action-card-placeholder" aria-hidden="true">?</div>
      <div>
        <span>SON HAMLE</span>
        <strong>Kartlar rastgele dağıtıldı</strong>
        <p>Çiftler açıldı. Eşsiz papaz masada.</p>
      </div>
    `;
    return;
  }

  const visual = lastActionState.card
    ? cardFaceMarkup(lastActionState.card, "action-card")
    : '<span class="table-card card-back action-card" aria-hidden="true"></span>';
  lastActionElement.innerHTML = `
    ${visual}
    <div>
      <span>${lastActionState.label}</span>
      <strong>${lastActionState.title}</strong>
      <p>${lastActionState.detail}</p>
    </div>
  `;
}

function render() {
  players.forEach(renderSeat);
  renderDiscardPile();
  renderLastAction();

  const totalCards = players.reduce((total, player) => total + player.hand.length, 0);
  remainingCardsElement.textContent = totalCards;
  dealerLabel.textContent = `Dağıtan: ${players[dealerId]?.name ?? "—"}`;
  turnLabel.textContent = gameOver ? "El bitti" : players[currentPlayerId]?.name ?? "—";

  const targetId =
    currentPlayerId === 0 && !gameOver && !isBusy ? nextActivePlayer(0) : -1;
  pickMarker.classList.toggle("is-visible", targetId !== -1);
  if (targetId !== -1) {
    document.querySelector(`#seat-${targetId}`).appendChild(pickMarker);
  }
}

function clearGameTimers() {
  window.clearTimeout(botTimer);
  window.clearTimeout(transitionTimer);
  botTimer = null;
  transitionTimer = null;
}

function updateEscapedPlayers() {
  players.forEach((player) => {
    if (player.hand.length === 0) player.escaped = true;
  });
}

function finishGameIfNeeded() {
  const activeIds = activePlayerIds();
  if (activeIds.length !== 1) return false;

  gameOver = true;
  isBusy = false;
  currentPlayerId = activeIds[0];
  const loser = players[currentPlayerId];
  const humanLost = loser.id === 0;
  statusElement.textContent = humanLost
    ? "Eşsiz papaz sende kaldı."
    : `Eşsiz papaz ${loser.name} oyuncusunda kaldı.`;
  resultTitle.textContent = humanLost ? "Papaz sende kaldı" : "Bu eli kazandın";
  resultText.textContent = humanLost
    ? "Son eşleşmeyen kartı sen tuttun. Kartları yeniden dağıtıp rövanşı başlatabilirsin."
    : `${loser.name} eşsiz papazla kaldı. Sen kartlarını zamanında bitirdin.`;
  render();
  transitionTimer = window.setTimeout(() => {
    resultOverlay.classList.add("is-visible");
  }, 800);
  return true;
}

function resolveDraw(playerId, cardIndex) {
  if (gameOver || players[playerId].hand.length === 0) {
    isBusy = false;
    return;
  }

  const player = players[playerId];
  const targetId = nextActivePlayer(playerId);
  const target = players[targetId];
  const safeIndex = Math.max(0, Math.min(cardIndex, target.hand.length - 1));
  const [drawnCard] = target.hand.splice(safeIndex, 1);
  const matchingIndex = player.hand.findIndex(
    (card) => card.value === drawnCard.value,
  );
  let pair = null;

  if (matchingIndex >= 0) {
    const [matchingCard] = player.hand.splice(matchingIndex, 1);
    pair = [matchingCard, drawnCard];
    discardedPairs.push({ playerId, cards: pair });
  } else {
    player.hand.push(drawnCard);
  }

  player.hand =
    playerId === 0 ? sortHumanHand(player.hand) : shuffle(player.hand);
  target.hand =
    targetId === 0 ? sortHumanHand(target.hand) : shuffle(target.hand);

  if (playerId === 0) {
    lastActionState = {
      label: "SEN ÇEKTİN",
      title: `${target.name} oyuncusundan ${cardLabel(drawnCard)}`,
      detail: pair
        ? `${cardLabel(pair[0])} ile eşleşti; çift masaya açıldı.`
        : "Eşleşmedi; kart eline eklendi.",
      card: null,
    };
  } else if (targetId === 0) {
    lastActionState = {
      label: "SENDEN ÇEKİLDİ",
      title: `${player.name} senden kapalı bir kart aldı`,
      detail: pair
        ? "Çekilen kart eşleşti ve çift masaya açıldı."
        : "Kart rakibin elinde kaldı.",
      card: null,
    };
  } else {
    lastActionState = {
      label: "RAKİP HAMLESİ",
      title: `${player.name}, ${target.name} oyuncusundan çekti`,
      detail: pair
        ? `${cardLabel(drawnCard)} ile bir çift açıldı.`
        : "Kapalı kart rakibin eline geçti.",
      card: null,
    };
  }

  statusElement.textContent = pair
    ? `${player.name} bir çift açtı.`
    : `${player.name} kartı elinde tuttu.`;
  updateEscapedPlayers();
  render();

  if (finishGameIfNeeded()) return;

  transitionTimer = window.setTimeout(() => {
    currentPlayerId = nextActivePlayer(playerId);
    isBusy = false;
    statusElement.textContent =
      currentPlayerId === 0
        ? "Sıra sende. Sağındaki parlayan elden bir kart seç."
        : `${players[currentPlayerId].name} kapalı bir kart seçiyor…`;
    render();
    scheduleBotTurn();
  }, 950);
}

function performDraw(playerId, cardIndex) {
  if (gameOver || isBusy || players[playerId].hand.length === 0) return;

  isBusy = true;
  resolveDraw(playerId, cardIndex);
}

function humanTurn(cardIndex) {
  if (currentPlayerId !== 0 || rulesOpen || gameOver || isBusy) return;

  const targetId = nextActivePlayer(0);
  const target = players[targetId];
  if (!target || target.hand.length === 0) return;

  const safeIndex = Math.max(0, Math.min(cardIndex, target.hand.length - 1));
  const selectedCard = target.hand[safeIndex];

  isBusy = true;
  lastActionState = {
    label: "SEÇTİĞİN KART",
    title: `${target.name} oyuncusundan ${cardLabel(selectedCard)}`,
    detail: "Kart iki saniye açık kalacak; ardından hamle işlenecek.",
    card: selectedCard,
  };
  statusElement.textContent = `${cardLabel(selectedCard)} kartını seçtin.`;
  render();

  transitionTimer = window.setTimeout(() => {
    resolveDraw(0, safeIndex);
  }, 2000);
}

function scheduleBotTurn() {
  window.clearTimeout(botTimer);
  if (rulesOpen || gameOver || currentPlayerId === 0 || isBusy) return;

  botTimer = window.setTimeout(() => {
    const targetId = nextActivePlayer(currentPlayerId);
    const target = players[targetId];
    const randomIndex = Math.floor(Math.random() * target.hand.length);
    performDraw(currentPlayerId, randomIndex);
  }, 850 + Math.floor(Math.random() * 450));
}

function deal() {
  clearGameTimers();
  resultOverlay.classList.remove("is-visible");
  players = playerNames.map((name, id) => ({
    id,
    name,
    hand: [],
    escaped: false,
  }));
  discardedPairs = [];
  lastActionState = null;
  gameOver = false;
  isBusy = false;
  dealerId = Math.floor(Math.random() * players.length);

  createDeck().forEach((card, index) => {
    const playerId = (dealerId + 1 + index) % players.length;
    players[playerId].hand.push(card);
  });
  players.forEach((player) => {
    player.hand = removeInitialPairs(player.hand, player.id);
  });
  players[0].hand = sortHumanHand(players[0].hand);
  updateEscapedPlayers();

  currentPlayerId = nextActivePlayer(dealerId);
  statusElement.textContent =
    currentPlayerId === 0
      ? "Sıra sende. Sağındaki parlayan elden bir kart seç."
      : `${players[currentPlayerId].name} oyuna başlıyor…`;
  render();
  scheduleBotTurn();
}

resetButton.addEventListener("click", deal);
newRoundButton.addEventListener("click", deal);
helpButton.addEventListener("click", () => {
  window.clearTimeout(botTimer);
  botTimer = null;
  rulesOpen = true;
  closeRules.textContent = "Oyuna dön";
  rulesOverlay.classList.add("is-visible");
});
closeRules.addEventListener("click", () => {
  rulesOpen = false;
  rulesOverlay.classList.remove("is-visible");
  scheduleBotTurn();
});

deal();
