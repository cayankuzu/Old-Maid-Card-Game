"use strict";

/* ==========================================================================
   Papaz Kaçtı · MeMoDe
   Dört oyuncu, tek papaz. Kişilikli rakipler, yem ve blöf; 10 puanlık maçlar.
   ========================================================================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const STORAGE_KEY = "memode-old-maid-v2";
const MATCH_TARGET = 10;
const ESCAPE_POINTS = [3, 2, 1];
const SUITS = ["♣", "♦", "♥", "♠"];
const RANKS = [
  { value: 1, label: "A" },
  ...Array.from({ length: 9 }, (_, index) => ({ value: index + 2, label: String(index + 2) })),
  { value: 11, label: "J" },
  { value: 12, label: "Q" },
  { value: 13, label: "K" },
];
const SPEED = {
  normal: { bot: 1000, reveal: 1150, next: 850 },
  fast: { bot: 480, reveal: 700, next: 420 },
};

const CAST = [
  { id: 0, name: "Sen", initial: "S", tone: "#f2c35a", trait: null },
  {
    id: 1,
    name: "Ada",
    initial: "A",
    tone: "#ff8fa8",
    trait: "curious",
    traitLabel: "Meraklı",
    about: "Öne çıkan kartı sever. Papazı tutarken genelde onu öne çıkarır.",
  },
  {
    id: 2,
    name: "Efe",
    initial: "E",
    tone: "#8fb4ff",
    trait: "careful",
    traitLabel: "Temkinli",
    about: "Öne çıkan karttan kaçar. Papazı tutarken başka kartla blöf yapar.",
  },
  {
    id: 3,
    name: "Mina",
    initial: "M",
    tone: "#ffd27a",
    trait: "wild",
    traitLabel: "Kumarbaz",
    about: "Yemi umursamaz; tamamen içgüdüsüyle oynar.",
  },
];

/* ------------------------------------------------------------ persistence */

function loadStore() {
  const defaults = { matches: 0, matchWins: 0, hands: 0, kings: 0, speed: "normal", muted: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

const store = loadStore();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* Kayıt yapılamasa da oyun sürer. */
  }
}

/* ------------------------------------------------------------------ audio */

const sound = (() => {
  let context = null;

  function ctx() {
    if (store.muted) return null;
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    }
    if (context.state === "suspended") context.resume();
    return context;
  }

  function tone(frequency, duration, { type = "sine", gain = 0.1, delay = 0, slide = 0 } = {}) {
    const audio = ctx();
    if (!audio) return;
    const start = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const volume = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(frequency * slide, start + duration);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(volume).connect(audio.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function noise(duration, { gain = 0.12, frequency = 3000 } = {}) {
    const audio = ctx();
    if (!audio) return;
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const volume = audio.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    volume.gain.value = gain;
    source.connect(filter).connect(volume).connect(audio.destination);
    source.start();
  }

  return {
    click: () => tone(880, 0.05, { type: "square", gain: 0.03 }),
    draw: () => noise(0.12, { gain: 0.16 }),
    pair: () => (tone(523, 0.16, { type: "triangle", gain: 0.1 }), tone(784, 0.2, { type: "triangle", gain: 0.1, delay: 0.08 })),
    king: () => (tone(110, 0.6, { type: "sawtooth", gain: 0.06, slide: 0.7 }), tone(220, 0.5, { type: "triangle", gain: 0.05, delay: 0.05 })),
    escape: () => [659, 784, 988].forEach((f, i) => tone(f, 0.25, { type: "sine", gain: 0.08, delay: i * 0.07 })),
    shuffle: () => [0, 0.05, 0.1, 0.15].forEach((delay) => window.setTimeout(() => noise(0.06, { gain: 0.1, frequency: 4200 }), delay * 1000)),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.45, { type: "triangle", gain: 0.1, delay: i * 0.1 })),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, { type: "sawtooth", gain: 0.045, delay: i * 0.13 })),
  };
})();

/* ------------------------------------------------------------------ state */

const game = {
  players: [],
  handNumber: 0,
  dealer: 0,
  current: 0,
  busy: false,
  handOver: true,
  matchOver: false,
  paused: false,
  pile: [],
  escapeOrder: [],
  reveal: null,
  cursor: 0,
  timer: 0,
  newCardId: null,
  pileFresh: false,
  keyboard: false,
};

const el = {
  screens: { menu: $("#menuScreen"), game: $("#gameScreen") },
  records: $("#records"),
  menuCast: $("#menuCast"),
  handLabel: $("#handLabel"),
  standings: $("#standings"),
  speed: $("#speed"),
  sound: $("#soundToggle"),
  seats: Object.fromEntries($$("[data-seat]").map((node) => [node.dataset.seat, node])),
  pile: $("#pile"),
  reveal: $("#reveal"),
  pickzone: $("#pickzone"),
  status: $("#status"),
  shuffle: $("#shuffleButton"),
  pause: $("#pauseOverlay"),
  result: $("#resultOverlay"),
  rules: $("#rulesOverlay"),
  resultKicker: $("#resultKicker"),
  resultKing: $("#resultKing"),
  resultTitle: $("#resultTitle"),
  resultText: $("#resultText"),
  ranking: $("#ranking"),
  resultPrimary: $("#resultPrimary"),
  confetti: $("#confetti"),
};

/* ---------------------------------------------------------------- helpers */

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const isKing = (card) => card.value === 13;
const isRed = (card) => card.suit === "♦" || card.suit === "♥";
const cardLabel = (card) => `${card.label}${card.suit}`;
const active = (player) => player.hand.length > 0;

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function sortHand(hand) {
  return [...hand].sort((a, b) => a.value - b.value || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
}

function faceHTML(card, { tag = "", classes = "", attrs = "", tagName = "span" } = {}) {
  return `<${tagName} class="card${isRed(card) ? " is-red" : ""}${isKing(card) ? " card--king" : ""} ${classes}" ${attrs}>
    <span class="card__corner">${card.label}<small>${card.suit}</small></span>
    <span class="card__pip">${card.suit}</span>
    <span class="card__corner card__corner--end">${card.label}<small>${card.suit}</small></span>
    ${tag}
  </${tagName}>`;
}

function backHTML({ classes = "", attrs = "", tagName = "span" } = {}) {
  return `<${tagName} class="card card--back ${classes}" ${attrs}></${tagName}>`;
}

function nextActive(fromId) {
  for (let step = 1; step <= 4; step += 1) {
    const candidate = (fromId + step) % 4;
    if (active(game.players[candidate])) return candidate;
  }
  return fromId;
}

/** Bu oyuncudan kart çekecek olan kişi: bir önceki aktif oyuncu. */
function drawerOf(id) {
  for (let step = 1; step <= 3; step += 1) {
    const candidate = (id - step + 4) % 4;
    if (active(game.players[candidate])) return candidate;
  }
  return id;
}

function showScreen(name) {
  Object.entries(el.screens).forEach(([key, node]) => node.classList.toggle("is-active", key === name));
}

function openOverlay(node) {
  node.hidden = false;
  requestAnimationFrame(() => $(".btn--primary, button", node)?.focus());
}

function closeOverlay(node) {
  node.hidden = true;
}

function setStatus(html, danger = false) {
  el.status.innerHTML = html;
  el.status.classList.toggle("is-danger", danger);
}

const nameOf = (id) => game.players[id].name;

/* ------------------------------------------------------------------- menu */

function renderMenu() {
  el.records.innerHTML = `
    <div><dt>Maç</dt><dd>${store.matchWins}/${store.matches}</dd></div>
    <div><dt>Oynanan el</dt><dd>${store.hands}</dd></div>
    <div><dt>Papaz sende</dt><dd>${store.kings}</dd></div>`;
  el.menuCast.innerHTML =
    CAST.slice(1)
      .map(
        (member) => `<div class="cast" style="--tone:${member.tone}">
          <span class="avatar">${member.initial}</span>
          <strong>${member.name}</strong>
          <span class="trait">${member.traitLabel}</span>
          <small>${member.about}</small>
        </div>`,
      )
      .join("") +
    `<div class="menu-king">${faceHTML({ value: 13, label: "K", suit: "♠" })}</div>`;
}

/* ------------------------------------------------------------------ match */

function newMatch() {
  closeOverlay(el.result);
  closeOverlay(el.pause);
  game.players = CAST.map((member) => ({ ...member, hand: [], baitId: null, score: 0, escaped: false }));
  game.handNumber = 0;
  game.matchOver = false;
  game.dealer = Math.floor(Math.random() * 4);
  showScreen("game");
  deal();
}

function deal() {
  window.clearTimeout(game.timer);
  closeOverlay(el.result);
  game.handNumber += 1;
  game.dealer = (game.dealer + 1) % 4;
  game.pile = [];
  game.escapeOrder = [];
  game.reveal = null;
  game.handOver = false;
  game.busy = false;
  game.paused = false;
  game.newCardId = null;
  game.players.forEach((player) => {
    player.hand = [];
    player.baitId = null;
    player.escaped = false;
  });

  const deck = shuffle(
    SUITS.flatMap((suit) => RANKS.map((rank) => ({ ...rank, suit, id: `${rank.label}${suit}` }))).filter(
      (card) => !isKing(card) || card.suit === "♠",
    ),
  );
  deck.forEach((card, index) => game.players[(game.dealer + 1 + index) % 4].hand.push(card));

  game.players.forEach((player) => {
    const groups = new Map();
    player.hand.forEach((card) => groups.set(card.value, [...(groups.get(card.value) || []), card]));
    const remaining = [];
    groups.forEach((cards) => {
      const pool = shuffle(cards);
      while (pool.length >= 2) game.pile.push({ by: player.id, cards: [pool.pop(), pool.pop()] });
      if (pool.length) remaining.push(pool[0]);
    });
    player.hand = player.id === 0 ? sortHand(remaining) : shuffle(remaining);
  });

  game.players.slice(1).forEach(arrangeBot);
  markEscapes();
  game.current = nextActive(game.dealer);
  game.cursor = 0;
  game.reveal = { label: "Yeni el", title: `${nameOf(game.dealer)} dağıttı`, detail: `${game.pile.length} çift masaya açıldı. Papaz birinin elinde…` };
  sound.shuffle();
  render();
  startTurn();
}

/* --------------------------------------------------------------------- AI */

function arrangeBot(bot) {
  bot.baitId = null;
  bot.hand = shuffle(bot.hand);
  if (bot.hand.length < 2) return;
  const king = bot.hand.find(isKing);
  const drawer = game.players[drawerOf(bot.id)];
  const style = drawer.id === 0 ? bot.trait : drawer.trait;
  if (king) {
    const others = bot.hand.filter((card) => !isKing(card));
    if (style === "curious") bot.baitId = Math.random() < 0.62 ? king.id : null;
    else if (style === "careful") bot.baitId = Math.random() < 0.62 ? pick(others).id : null;
    else bot.baitId = Math.random() < 0.35 ? pick(bot.hand).id : null;
  } else {
    bot.baitId = Math.random() < 0.28 ? pick(bot.hand).id : null;
  }
}

function botChoose(bot, target) {
  const count = target.hand.length;
  const baitIndex = target.hand.findIndex((card) => card.id === target.baitId);
  if (baitIndex < 0 || count === 1) return Math.floor(Math.random() * count);
  const others = [...Array(count).keys()].filter((index) => index !== baitIndex);
  const roll = Math.random();
  if (bot.trait === "curious") return roll < 0.72 ? baitIndex : pick(others);
  if (bot.trait === "careful") return roll < 0.12 ? baitIndex : pick(others);
  return Math.floor(Math.random() * count);
}

/* ------------------------------------------------------------------- turn */

function startTurn() {
  if (game.handOver || game.paused) return;
  const player = game.players[game.current];
  const target = game.players[nextActive(game.current)];
  if (player.id === 0) {
    game.busy = false;
    game.cursor = Math.min(game.cursor, target.hand.length - 1);
    setStatus(`Sıra sende · <b>${target.name}</b> elinden bir kart çek.`);
    render();
    return;
  }
  game.busy = true;
  setStatus(`<b>${player.name}</b>, ${target.id === 0 ? "senden" : `${target.name} elinden`} bir kart seçiyor…`);
  render();
  game.timer = window.setTimeout(() => {
    if (game.paused || game.handOver) return;
    resolveDraw(player.id, botChoose(player, target));
  }, SPEED[store.speed].bot + Math.random() * 350);
}

function humanPick(index) {
  if (game.current !== 0 || game.busy || game.handOver || game.paused) return;
  const target = game.players[nextActive(0)];
  const card = target.hand[index];
  if (!card) return;
  game.busy = true;
  sound.draw();
  game.reveal = {
    card,
    label: "Seçtiğin kart",
    title: `${target.name} elinden ${cardLabel(card)}`,
    detail: isKing(card) ? "Eyvah! Papaz geldi." : "Eşleşme aranıyor…",
  };
  if (isKing(card)) sound.king();
  render();
  game.timer = window.setTimeout(() => resolveDraw(0, index), SPEED[store.speed].reveal);
}

function resolveDraw(playerId, index) {
  const player = game.players[playerId];
  const target = game.players[nextActive(playerId)];
  const [card] = target.hand.splice(index, 1);
  if (!card) return;
  if (target.baitId === card.id) target.baitId = null;

  const matchIndex = player.hand.findIndex((held) => held.value === card.value);
  let pair = null;
  if (matchIndex >= 0) {
    const [held] = player.hand.splice(matchIndex, 1);
    pair = [held, card];
    game.pile.push({ by: playerId, cards: pair });
    game.pileFresh = true;
    if (player.baitId === held.id) player.baitId = null;
  } else if (playerId === 0) {
    player.hand = sortHand([...player.hand, card]);
    game.newCardId = card.id;
  } else {
    player.hand.splice(Math.floor(Math.random() * (player.hand.length + 1)), 0, card);
  }

  if (playerId !== 0) sound.draw();
  if (pair) sound.pair();

  if (playerId === 0) {
    game.reveal = {
      card,
      label: "Sen çektin",
      title: `${target.name} elinden ${cardLabel(card)}`,
      detail: pair ? `${cardLabel(pair[0])} ile eşleşti · çift masada.` : isKing(card) ? "Papaz artık sende. Onu kaçırmanın yolunu bul." : "Eşleşmedi · eline eklendi.",
    };
  } else if (target.id === 0) {
    game.reveal = {
      card,
      label: "Senden çekildi",
      title: `${player.name} senden ${cardLabel(card)} aldı`,
      detail: isKing(card) ? "Papazdan kurtuldun!" : pair ? "Onun elinde eşleşti · çift masada." : "Kart rakibin elinde kaldı.",
    };
    if (isKing(card)) sound.escape();
  } else {
    game.reveal = {
      card: pair ? card : null,
      label: "Rakip hamlesi",
      title: `${player.name}, ${target.name} elinden çekti`,
      detail: pair ? `${cardLabel(card)} ile bir çift açıldı.` : "Kapalı kart el değiştirdi.",
    };
  }

  // El değişen yapay zekâlar yemlerini yeniden düzenler.
  [player, target].forEach((member) => member.id !== 0 && arrangeBot(member));
  if (target.id === 0 && player.id !== 0) game.newCardId = null;

  markEscapes();
  render();

  if (finishHandIfNeeded()) return;

  // Sıra hemen ilerler; duraklatılıp devam edilirse aynı oyuncu iki kez oynamaz.
  game.current = nextActive(playerId);
  game.timer = window.setTimeout(startTurn, SPEED[store.speed].next);
}

function markEscapes() {
  game.players.forEach((player) => {
    if (!player.escaped && !active(player) && game.escapeOrder.length < 3) {
      player.escaped = true;
      game.escapeOrder.push(player.id);
      if (!game.handOver && game.pile.length) {
        sound.escape();
      }
    }
  });
}

function finishHandIfNeeded() {
  const remaining = game.players.filter(active);
  if (remaining.length !== 1) return false;

  game.handOver = true;
  game.busy = false;
  window.clearTimeout(game.timer);
  const loser = remaining[0];
  const points = {};
  game.escapeOrder.forEach((id, index) => {
    points[id] = ESCAPE_POINTS[index] ?? 0;
    game.players[id].score += points[id];
  });
  points[loser.id] = 0;

  store.hands += 1;
  if (loser.id === 0) store.kings += 1;

  const leader = [...game.players].sort((a, b) => b.score - a.score)[0];
  game.matchOver = leader.score >= MATCH_TARGET;
  if (game.matchOver) {
    store.matches += 1;
    if (leader.id === 0) store.matchWins += 1;
  }
  save();

  setStatus(loser.id === 0 ? "<b>Papaz sende kaldı.</b>" : `<b>${loser.name}</b> papazla kaldı.`, loser.id === 0);
  render();

  const youWon = game.matchOver ? leader.id === 0 : loser.id !== 0;
  if (game.matchOver && leader.id === 0) {
    sound.win();
    window.setTimeout(() => burstConfetti(140), 300);
  } else if (loser.id === 0) {
    sound.lose();
  } else {
    sound.escape();
  }

  game.timer = window.setTimeout(() => showResult(loser, points, leader, youWon), 1200);
  return true;
}

function showResult(loser, points, leader, youWon) {
  const you = game.players[0];
  const place = game.escapeOrder.indexOf(0);
  el.resultKing.innerHTML = faceHTML({ value: 13, label: "K", suit: "♠" });
  el.resultTitle.className = `result-title ${youWon ? "is-win" : "is-loss"}`;

  if (game.matchOver) {
    el.resultKicker.textContent = `Maç bitti · ${game.handNumber} el`;
    el.resultTitle.textContent = leader.id === 0 ? "Maçı kazandın!" : `Maçı ${leader.name} kazandı`;
    el.resultText.textContent = `${leader.name} ${leader.score} puana ulaştı. Sen ${you.score} puanla bitirdin.`;
    el.resultPrimary.textContent = "Rövanş";
  } else {
    el.resultKicker.textContent = `El ${game.handNumber} bitti`;
    el.resultTitle.textContent = loser.id === 0 ? "Papaz sende kaldı" : place === 0 ? "İlk sen kurtuldun!" : "Kurtuldun!";
    el.resultText.textContent =
      loser.id === 0
        ? `Bu elden puan yok. Maç ${MATCH_TARGET} puana kadar sürüyor.`
        : `${place + 1}. sırada çıktın · +${points[0]} puan. Papaz ${loser.name} elinde kaldı.`;
    el.resultPrimary.textContent = "Sonraki el";
  }

  el.ranking.innerHTML = [...game.players]
    .sort((a, b) => b.score - a.score)
    .map(
      (player, index) => `<li class="${player.id === 0 ? "is-you" : ""}" style="--tone:${player.tone}">
        <em>${index + 1}</em>
        <span class="avatar">${player.initial}</span>
        <span>${player.name} <small>${player.id === loser.id ? "· papaz" : `· +${points[player.id] ?? 0}`}</small></span>
        <b>${player.score}</b>
      </li>`,
    )
    .join("");
  openOverlay(el.result);
}

/* ----------------------------------------------------------------- render */

function seatHead(player) {
  return `<div class="seat__head">
    <span class="avatar">${player.initial}</span>
    <div class="seat__name"><strong>${player.name}</strong>${player.traitLabel ? `<span class="trait">${player.traitLabel}</span>` : ""}</div>
  </div>
  <div class="seat__meta">${player.escaped ? "Kurtuldu" : `${player.hand.length} kart`} · ${player.score} puan</div>`;
}

function opponentHand(player, pickable) {
  if (!active(player)) return `<div class="hand"><span class="empty-hand">Kurtuldu</span></div>`;
  const count = player.hand.length;
  const middle = (count - 1) / 2;
  return `<div class="hand" style="--overlap:${count > 8 ? -0.66 : -0.55}">${player.hand
    .map((card, index) => {
      const bait = card.id === player.baitId;
      const style = `style="--rot:${(index - middle) * (pickable ? 2 : 3)}deg"`;
      const classes = `${bait ? "is-raised" : ""}${pickable && game.keyboard && index === game.cursor ? " is-cursor" : ""}`;
      return pickable
        ? backHTML({ tagName: "button", classes, attrs: `type="button" data-pick="${index}" ${style} aria-label="${player.name} elindeki ${index + 1}. kart${bait ? ", öne çıkarılmış" : ""}"` })
        : backHTML({ classes, attrs: style });
    })
    .join("")}</div>`;
}

function myHand(player) {
  if (!active(player)) return `<div class="hand"><span class="empty-hand">Elin bitti · kurtuldun</span></div>`;
  const count = player.hand.length;
  const middle = (count - 1) / 2;
  return `<div class="hand" style="--overlap:${count > 9 ? -0.5 : -0.38}">${player.hand
    .map((card, index) => {
      const bait = card.id === player.baitId;
      const tags = `${bait ? '<span class="tag">YEM</span>' : ""}${isKing(card) && !bait ? '<span class="tag tag--king">PAPAZ</span>' : ""}`;
      const classes = `${bait ? "is-raised is-bait" : ""}${isKing(card) ? " is-king" : ""}${card.id === game.newCardId ? " is-new" : ""}`;
      return faceHTML(card, {
        tagName: "button",
        tag: tags,
        classes,
        attrs: `type="button" data-bait="${card.id}" style="--rot:${(index - middle) * 2.2}deg" aria-label="${cardLabel(card)}${bait ? ", yem" : ""}. Yem yapmak için seç."`,
      });
    })
    .join("")}</div>`;
}

function myHint(player) {
  if (!active(player)) return "Bu el için işin bitti; diğerlerini izle.";
  const drawer = game.players[drawerOf(0)];
  if (drawer.id === 0) return "";
  const hasKing = player.hand.some(isKing);
  const who = `<b>${drawer.name}</b> senden çekecek`;
  if (!hasKing) return `${who} · Papaz sende değil. Bir karta tıklayıp yem yapabilirsin.`;
  if (drawer.trait === "curious") return `${who} · Meraklı: papazı öne çıkarırsan onu alması muhtemel.`;
  if (drawer.trait === "careful") return `${who} · Temkinli: başka bir kartı öne çıkar, papaz gölgede kalsın.`;
  return `${who} · Kumarbaz: yemi umursamaz, şansına güven.`;
}

function render() {
  const humanTurn = game.current === 0 && !game.busy && !game.handOver && !game.paused;
  const targetId = game.handOver ? -1 : nextActive(game.current);

  game.players.forEach((player) => {
    const seat = el.seats[player.id];
    const isTurn = !game.handOver && game.current === player.id;
    const isTarget = humanTurn && targetId === player.id;
    seat.style.setProperty("--tone", player.tone);
    seat.classList.toggle("is-turn", isTurn);
    seat.classList.toggle("is-target", isTarget);
    seat.classList.toggle("is-out", player.escaped);
    seat.classList.toggle("has-king", player.id === 0 && player.hand.some(isKing));

    const badge = isTarget
      ? '<span class="seat__badge seat__badge--target">Buradan çek</span>'
      : isTurn
        ? `<span class="seat__badge">${player.id === 0 ? "Sıra sende" : "Sırada"}</span>`
        : "";

    if (player.id === 0) {
      seat.innerHTML = `${badge}${seatHead(player)}${myHand(player)}<p class="seat__hint">${myHint(player)}</p>`;
    } else {
      seat.innerHTML = `${badge}${seatHead(player)}${opponentHand(player, isTarget)}`;
    }
  });

  if (humanTurn && targetId > 0) {
    const target = game.players[targetId];
    el.pickzone.innerHTML = `<span class="pickzone__label">${target.name} elinden bir kart seç</span>${opponentHand(target, true)}`;
  } else {
    el.pickzone.innerHTML = "";
  }

  const recent = game.pile.slice(-3);
  el.pile.innerHTML =
    recent
      .flatMap((pair, pairIndex) => pair.cards.map((card, cardIndex) => faceHTML(card, { attrs: `style="--rot:${(pairIndex - 1) * 7 + (cardIndex ? 4 : -4)}deg"` })))
      .join("") + (game.pile.length ? `<span class="pile__count">${game.pile.length} çift</span>` : "");
  el.pile.classList.toggle("is-new", game.pileFresh);
  game.pileFresh = false;

  if (game.reveal) {
    const visual = game.reveal.card ? faceHTML(game.reveal.card) : backHTML();
    el.reveal.innerHTML = `${visual}<div><span>${game.reveal.label}</span><strong>${game.reveal.title}</strong><p>${game.reveal.detail}</p></div>`;
  }

  el.handLabel.textContent = `El ${game.handNumber} · hedef ${MATCH_TARGET} puan`;
  el.standings.innerHTML = [...game.players]
    .sort((a, b) => b.score - a.score)
    .map((player) => `<li style="--tone:${player.tone}"><span class="avatar">${player.initial}</span>${player.name}<b>${player.score}</b></li>`)
    .join("");
  $$("[data-speed]", el.speed).forEach((button) => button.setAttribute("aria-checked", String(button.dataset.speed === store.speed)));
  el.shuffle.disabled = game.handOver || game.players[0].hand.length < 2;
}

/* ---------------------------------------------------------------- actions */

function toggleBait(cardId) {
  const me = game.players[0];
  if (game.handOver || !me.hand.some((card) => card.id === cardId)) return;
  me.baitId = me.baitId === cardId ? null : cardId;
  sound.click();
  render();
}

function shuffleMine() {
  const me = game.players[0];
  if (game.handOver || me.hand.length < 2) return;
  me.hand = shuffle(me.hand);
  sound.shuffle();
  render();
}

function pause() {
  if (!el.screens.game.classList.contains("is-active") || game.handOver || game.paused) return;
  game.paused = true;
  window.clearTimeout(game.timer);
  openOverlay(el.pause);
}

function resume() {
  closeOverlay(el.pause);
  if (!game.paused) return;
  game.paused = false;
  game.busy = false;
  if (!game.handOver) startTurn();
}

function burstConfetti(count) {
  const colors = ["var(--gold)", "#ff8fa8", "#8fb4ff", "#ffd27a", "#fff5e4"];
  const pieces = Array.from({ length: count }, () => {
    const piece = document.createElement("i");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = pick(colors);
    piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 260}px`);
    piece.style.setProperty("--rot", `${Math.random() * 900 - 450}deg`);
    piece.style.setProperty("--dur", `${1.8 + Math.random() * 1.6}s`);
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    return piece;
  });
  el.confetti.append(...pieces);
  window.setTimeout(() => pieces.forEach((piece) => piece.remove()), 4200);
}

function setMuted(muted) {
  store.muted = muted;
  save();
  el.sound.classList.toggle("is-muted", muted);
  el.sound.setAttribute("aria-label", muted ? "Sesi aç" : "Sesi kapat");
}

/* ----------------------------------------------------------------- events */

document.addEventListener("pointerdown", () => {
  game.keyboard = false;
});

$("#table").addEventListener("click", (event) => {
  const pickButton = event.target.closest("[data-pick]");
  if (pickButton) return humanPick(Number(pickButton.dataset.pick));
  const baitButton = event.target.closest("[data-bait]");
  if (baitButton) toggleBait(baitButton.dataset.bait);
});

el.shuffle.addEventListener("click", shuffleMine);
el.sound.addEventListener("click", () => setMuted(!store.muted));
$("#pauseButton").addEventListener("click", pause);
el.speed.addEventListener("click", (event) => {
  const button = event.target.closest("[data-speed]");
  if (!button) return;
  store.speed = button.dataset.speed;
  save();
  render();
});

el.resultPrimary.addEventListener("click", () => {
  sound.click();
  if (game.matchOver) newMatch();
  else deal();
});

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  sound.click();
  switch (action) {
    case "new-match":
      newMatch();
      break;
    case "menu":
      window.clearTimeout(game.timer);
      game.handOver = true;
      closeOverlay(el.pause);
      closeOverlay(el.result);
      renderMenu();
      showScreen("menu");
      break;
    case "open-rules":
      if (el.screens.game.classList.contains("is-active") && !game.handOver && !game.paused) {
        game.paused = true;
        window.clearTimeout(game.timer);
        el.rules.dataset.resume = "true";
      }
      openOverlay(el.rules);
      break;
    case "close-rules":
      closeOverlay(el.rules);
      if (el.rules.dataset.resume) {
        delete el.rules.dataset.resume;
        game.paused = false;
        game.busy = false;
        startTurn();
      }
      break;
    case "resume":
      resume();
      break;
    default:
      break;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();

  if (key === "escape") {
    if (!el.rules.hidden) return $("[data-action='close-rules']", el.rules).click();
    if (!el.pause.hidden) return resume();
    return pause();
  }
  if (key === "m") return setMuted(!store.muted);
  if (!el.result.hidden && (key === "enter" || key === " ")) {
    event.preventDefault();
    return el.resultPrimary.click();
  }
  if (!el.screens.game.classList.contains("is-active") || !el.pause.hidden || !el.rules.hidden) return;

  if (key === "k") return shuffleMine();
  if (key === "h") return $("[data-action='open-rules']", el.screens.game).click();

  const humanTurn = game.current === 0 && !game.busy && !game.handOver;
  if (!humanTurn) return;
  const target = game.players[nextActive(0)];
  if (key === "arrowleft" || key === "arrowright") {
    event.preventDefault();
    game.keyboard = true;
    const step = key === "arrowleft" ? -1 : 1;
    game.cursor = (game.cursor + step + target.hand.length) % target.hand.length;
    render();
  } else if (key === "enter" || key === " ") {
    event.preventDefault();
    humanPick(game.cursor);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});

/* ------------------------------------------------------------------- boot */

setMuted(store.muted);
renderMenu();
