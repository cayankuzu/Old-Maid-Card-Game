const suits = ["♣", "♦", "♥", "♠"];
const ranks = [
  { value: 1, label: "A" },
  ...Array.from({ length: 9 }, (_, index) => ({ value: index + 2, label: String(index + 2) })),
  { value: 11, label: "J" },
  { value: 12, label: "Q" },
  { value: 13, label: "K" },
];
const playerNames = ["Sen", "Ada", "Efe", "Mina"];

let players = [];
let activeOrder = [];
let currentPlayerId = 0;
let gameOver = false;
let isBusy = false;
let logEntries = [];

const opponentsElement = document.querySelector("#opponents");
const drawHandElement = document.querySelector("#drawHand");
const playerHandElement = document.querySelector("#playerHand");
const statusElement = document.querySelector("#status");
const turnLabel = document.querySelector("#turnLabel");
const remainingCardsElement = document.querySelector("#remainingCards");
const playerStateElement = document.querySelector("#playerState");
const gameLog = document.querySelector("#gameLog");
const resetButton = document.querySelector("#resetButton");

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function createDeck() {
  return shuffle(
    suits
      .flatMap((suit) => ranks.map((rank) => ({ suit, ...rank })))
      .filter((card) => !(card.value === 13 && card.suit === "♣")),
  );
}

function removePairs(hand) {
  const byRank = new Map();
  hand.forEach((card) => {
    const cards = byRank.get(card.value) ?? [];
    cards.push(card);
    byRank.set(card.value, cards);
  });

  const remaining = [];
  let pairCount = 0;
  byRank.forEach((cards) => {
    pairCount += Math.floor(cards.length / 2);
    if (cards.length % 2 === 1) remaining.push(cards[0]);
  });

  return { hand: shuffle(remaining), pairCount };
}

function addLog(message) {
  logEntries.unshift(message);
}

function nextActivePlayer(playerId) {
  const index = activeOrder.indexOf(playerId);
  return activeOrder[(index + 1) % activeOrder.length];
}

function cardLabel(card) {
  return `${card.label}${card.suit}`;
}

function deal() {
  players = playerNames.map((name, id) => ({ id, name, hand: [], escaped: false }));
  createDeck().forEach((card, index) => players[index % players.length].hand.push(card));
  logEntries = [];

  players.forEach((player) => {
    const result = removePairs(player.hand);
    player.hand = result.hand;
    if (result.pairCount > 0) {
      addLog(`${player.name} ${result.pairCount} çift açtı.`);
    }
  });

  activeOrder = players.filter((player) => player.hand.length > 0).map((player) => player.id);
  players
    .filter((player) => player.hand.length === 0)
    .forEach((player) => {
      player.escaped = true;
    });
  currentPlayerId = activeOrder.includes(0) ? 0 : activeOrder[0];
  gameOver = false;
  isBusy = false;
  statusElement.textContent = "Sağındaki oyuncudan bir kart seç.";
  addLog("Kartlar dağıtıldı, çiftler masadan çıkarıldı.");
  render();
  scheduleBotIfNeeded();
}

function renderOpponents() {
  opponentsElement.innerHTML = players
    .slice(1)
    .map((player) => {
      const cards = Array.from(
        { length: Math.min(player.hand.length, 9) },
        (_, index) => `<span class="mini-card" style="--index:${index}"></span>`,
      ).join("");
      return `
        <article class="opponent ${currentPlayerId === player.id ? "is-active" : ""} ${player.escaped ? "is-out" : ""}">
          <div class="opponent-head">
            <h3>${player.name}</h3>
            <span>${player.escaped ? "Kurtuldu" : `${player.hand.length} kart`}</span>
          </div>
          <div class="mini-hand">${cards}</div>
        </article>
      `;
    })
    .join("");
}

function renderDrawHand() {
  if (gameOver || currentPlayerId !== 0 || !activeOrder.includes(0)) {
    drawHandElement.innerHTML = `<div class="empty-state">${
      gameOver ? "Oyun tamamlandı." : "Rakipler hamle yapıyor…"
    }</div>`;
    return;
  }

  const target = players[nextActivePlayer(0)];
  const middle = (target.hand.length - 1) / 2;
  drawHandElement.innerHTML = target.hand
    .map(
      (_, index) => `
        <button
          class="draw-card"
          type="button"
          style="--index:${index};--middle:${middle};--offset:${Math.abs(index - middle)}"
          aria-label="${target.name} oyuncusunun ${index + 1}. kartını çek"
          data-card-index="${index}"
          ${isBusy ? "disabled" : ""}
        ></button>
      `,
    )
    .join("");

  drawHandElement.querySelectorAll(".draw-card").forEach((button) => {
    button.addEventListener("click", () => humanTurn(Number(button.dataset.cardIndex)));
  });
}

function renderPlayerHand() {
  const human = players[0];
  if (human.hand.length === 0) {
    playerHandElement.innerHTML = '<div class="empty-state">Elinde kart kalmadı.</div>';
  } else {
    playerHandElement.innerHTML = human.hand
      .map((card) => {
        const red = card.suit === "♦" || card.suit === "♥";
        return `
          <span class="playing-card ${red ? "red" : ""}" data-card="${cardLabel(card)}">
            ${cardLabel(card)}
          </span>
        `;
      })
      .join("");
  }
  playerStateElement.textContent = human.escaped
    ? "Kurtuldun"
    : gameOver && activeOrder[0] === 0
      ? "Papaz sende kaldı"
      : "Oyunda";
}

function render() {
  renderOpponents();
  renderDrawHand();
  renderPlayerHand();
  turnLabel.textContent = gameOver ? "Bitti" : players[currentPlayerId]?.name ?? "—";
  remainingCardsElement.textContent = players.reduce(
    (total, player) => total + player.hand.length,
    0,
  );
  gameLog.innerHTML = logEntries
    .slice(0, 6)
    .map((entry) => `<li>${entry}</li>`)
    .join("");
}

function drawFromPlayer(playerId, targetId, cardIndex) {
  const player = players[playerId];
  const target = players[targetId];
  const [card] = target.hand.splice(cardIndex, 1);
  player.hand.push(card);
  const result = removePairs(player.hand);
  player.hand = result.hand;

  addLog(
    `${player.name}, ${target.name} oyuncusundan kart çekti${
      result.pairCount ? ` ve ${result.pairCount} çift açtı` : ""
    }.`,
  );

  return card;
}

function updateActivePlayers() {
  players.forEach((player) => {
    if (player.hand.length === 0 && !player.escaped) {
      player.escaped = true;
      addLog(`${player.name} kartlarını bitirdi ve kurtuldu.`);
    }
  });
  activeOrder = activeOrder.filter((id) => players[id].hand.length > 0);

  if (activeOrder.length === 1) {
    gameOver = true;
    const loser = players[activeOrder[0]];
    currentPlayerId = loser.id;
    statusElement.textContent =
      loser.id === 0
        ? "Son papaz sende kaldı. Bu eli kaybettin."
        : `Son papaz ${loser.name} oyuncusunda kaldı. Kazandın!`;
    addLog(`${loser.name} son papazla kaldı.`);
    isBusy = false;
    render();
    return true;
  }
  return false;
}

function advanceTurn(fromPlayerId) {
  if (updateActivePlayers()) return;
  const currentIndex = activeOrder.indexOf(fromPlayerId);
  currentPlayerId =
    currentIndex === -1
      ? activeOrder[0]
      : activeOrder[(currentIndex + 1) % activeOrder.length];
  isBusy = false;
  statusElement.textContent =
    currentPlayerId === 0
      ? "Sıra sende. Sağındaki oyuncudan bir kart seç."
      : `${players[currentPlayerId].name} düşünüyor…`;
  render();
  scheduleBotIfNeeded();
}

function humanTurn(cardIndex) {
  if (gameOver || isBusy || currentPlayerId !== 0) return;
  isBusy = true;
  const targetId = nextActivePlayer(0);
  const card = drawFromPlayer(0, targetId, cardIndex);
  statusElement.textContent = `${cardLabel(card)} çektin.`;
  render();
  window.setTimeout(() => advanceTurn(0), 650);
}

function botTurn() {
  if (gameOver || currentPlayerId === 0) return;
  isBusy = true;
  const playerId = currentPlayerId;
  const targetId = nextActivePlayer(playerId);
  const target = players[targetId];
  const cardIndex = Math.floor(Math.random() * target.hand.length);
  drawFromPlayer(playerId, targetId, cardIndex);
  statusElement.textContent = `${players[playerId].name} kartını çekti.`;
  render();
  window.setTimeout(() => advanceTurn(playerId), 750);
}

function scheduleBotIfNeeded() {
  if (!gameOver && currentPlayerId !== 0) window.setTimeout(botTurn, 900);
}

resetButton.addEventListener("click", deal);
deal();
