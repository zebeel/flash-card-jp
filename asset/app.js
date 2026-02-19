// ══════════════════════════════════════
// DATA
// ══════════════════════════════════════
const DATA_URL = "https://script.google.com/macros/s/AKfycby7rIeJEfB5c-N73Mu9HLzn4It1WChPjhQhKep5XbhgwMYVsuJopFrwrfMSihYU7OHETg/exec";
let DATA = {
  topics: [],
  cards: []
};

async function loadAppData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    DATA = {
      topics: Array.isArray(json?.topics) ? json.topics : [],
      cards: Array.isArray(json?.cards) ? json.cards : []
    };

    // Load version
    if (json.settings?.version) {
      document.getElementById('version-text').textContent = `v${json.settings.version}`;
    }

    return true;
  } catch (error) {
    console.error('Failed to load app data:', error);
    alert('Không thể tải dữ liệu từ server. Vui lòng thử lại.');
    return false;
  }
}

// ══════════════════════════════════════
// STATE & SETTINGS
// ══════════════════════════════════════
let settings = {
  script: 'hiragana',
  topicId: 'shinkansen',
  autoSpeak: false
};

let cards = [];
let currentIndex = 0;
let isFlipped = false;

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('jpFlashSettings') || '{}');
    settings = { ...settings, ...saved };
  } catch(e) {}
}

function saveSettings() {
  try {
    localStorage.setItem('jpFlashSettings', JSON.stringify(settings));
  } catch(e) {}
}

// ══════════════════════════════════════
// FISHER-YATES SHUFFLE
// ══════════════════════════════════════
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ══════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════
const homePage = document.getElementById('home-page');
const flashPage = document.getElementById('flash-page');
const cardScene = document.getElementById('card-scene');
const cardInner = document.getElementById('card-inner');
const cardImg = document.getElementById('card-img');
const cardImgFallback = document.getElementById('card-img-fallback');
const cardRomaji = document.getElementById('card-romaji');
const kanaDisplay = document.getElementById('kana-display');
const kanaRomajiBack = document.getElementById('kana-romaji-back');
const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');
const soundBtn = document.getElementById('sound-btn');
const completeScreen = document.getElementById('complete-screen');
const swipeHint = document.getElementById('swipe-hint');
const autospeakIndicator = document.getElementById('autospeak-indicator');
const topicGrid = document.querySelector('.topic-grid');

// ══════════════════════════════════════
// HOME PAGE LOGIC
// ══════════════════════════════════════
function renderTopicButtons() {
  topicGrid.innerHTML = '';

  DATA.topics.forEach(topic => {
    const count = DATA.cards.filter(card => card.topicId === topic.id).length;
    const button = document.createElement('button');
    button.className = 'topic-btn';
    button.dataset.topic = topic.id;
    button.innerHTML = `
      <span class="icon">${topic.emoji || '📚'}</span>
      <span class="jp-name">${topic.name || topic.id}</span>
      <span class="count">${count} cards</span>
    `;
    topicGrid.appendChild(button);
  });

  if (!DATA.topics.some(topic => topic.id === settings.topicId)) {
    settings.topicId = DATA.topics[0]?.id || '';
  }
}

function applyHomepageSettings() {
  // Script buttons
  document.querySelectorAll('.script-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.script === settings.script);
  });
  // Topic buttons
  document.querySelectorAll('.topic-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.topic === settings.topicId);
  });
  // Auto speak
  document.getElementById('auto-speak-toggle').checked = settings.autoSpeak;
}

document.querySelectorAll('.script-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.script = btn.dataset.script;
    document.querySelectorAll('.script-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveSettings();
  });
});

topicGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.topic-btn');
  if (!btn) return;
  settings.topicId = btn.dataset.topic;
  document.querySelectorAll('.topic-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  saveSettings();
});

document.getElementById('auto-speak-toggle').addEventListener('change', (e) => {
  settings.autoSpeak = e.target.checked;
  saveSettings();
});

document.getElementById('start-btn').addEventListener('click', () => {
  if (!DATA.cards.length) return;
  saveSettings();
  startFlashcards();
});

// ══════════════════════════════════════
// START FLASHCARDS
// ══════════════════════════════════════
function startFlashcards() {
  const filtered = DATA.cards.filter(c => c.topicId === settings.topicId);
  if (!filtered.length) return;
  
  cards = shuffle(filtered);
  currentIndex = 0;
  isFlipped = false;

  homePage.classList.add('slide-out');
  flashPage.classList.remove('hidden');
  renderCard('right');
  updateProgress();

  // Show swipe hint briefly
  swipeHint.classList.remove('faded');
  setTimeout(() => { swipeHint.classList.add('faded'); }, 3000);
}

// ══════════════════════════════════════
// GO HOME
// ══════════════════════════════════════
function goHome() {
  flashPage.classList.add('hidden');
  homePage.classList.remove('slide-out');
  completeScreen.classList.remove('visible');
  cancelSpeech();
}

document.getElementById('back-btn').addEventListener('click', goHome);
document.getElementById('home-from-complete-btn').addEventListener('click', goHome);

// ══════════════════════════════════════
// FIT KANA TEXT
// ══════════════════════════════════════
function fitFrontKana() {
  const maxSize = 28;
  const minSize = 14;
  const padding = 40;
  cardRomaji.style.fontSize = maxSize + 'px';
  const available = cardRomaji.parentElement.offsetWidth - padding;
  if (available <= 0) return;
  const textWidth = cardRomaji.scrollWidth;
  if (textWidth > available) {
    const ratio = available / textWidth;
    const fitted = Math.max(minSize, Math.floor(maxSize * ratio));
    cardRomaji.style.fontSize = fitted + 'px';
  }
}

function fitKanaText() {
  const maxSize = 88;
  const minSize = 28;
  const padding = 32;
  kanaDisplay.style.fontSize = maxSize + 'px';
  const available = kanaDisplay.parentElement.offsetWidth - padding;
  if (available <= 0) return;
  const textWidth = kanaDisplay.scrollWidth;
  if (textWidth > available) {
    const ratio = available / textWidth;
    const fitted = Math.max(minSize, Math.floor(maxSize * ratio));
    kanaDisplay.style.fontSize = fitted + 'px';
  }
}

// ══════════════════════════════════════
// RENDER CARD
// ══════════════════════════════════════
function renderCard(dir = 'right') {
  const card = cards[currentIndex];
  if (!card) return;

  // Reset flip BEFORE animation
  isFlipped = false;
  cardInner.classList.remove('flipped');
  cardInner.style.transform = '';
  cardInner.style.opacity = '1';

  // Image with fallback to emoji
  cardImgFallback.textContent = card.emoji;
  cardImg.classList.add('loading');
  cardImg.classList.remove('error');
  cardImg.alt = card.romaji;
  cardImg.onload = () => cardImg.classList.remove('loading');
  cardImg.onerror = () => { 
    cardImg.classList.remove('loading');
    cardImg.classList.add('error');
  };
  cardImg.src = card.image;
  
  // Show kana on front
  const kana = card.kana[settings.script];
  cardRomaji.textContent = kana;
  requestAnimationFrame(fitFrontKana);

  // Kana on back
  kanaDisplay.textContent = kana;
  kanaRomajiBack.textContent = card.romaji;
  requestAnimationFrame(fitKanaText);

  // Animation
  cardScene.classList.remove('anim-right', 'anim-left');
  void cardScene.offsetWidth; // reflow
  cardScene.classList.add(dir === 'right' ? 'anim-right' : 'anim-left');
  setTimeout(() => cardScene.classList.remove('anim-right', 'anim-left'), 500);

  updateProgress();
}

// ══════════════════════════════════════
// PROGRESS
// ══════════════════════════════════════
function updateProgress() {
  const total = cards.length;
  const current = currentIndex + 1;
  progressText.textContent = `${current} / ${total}`;
  progressBar.style.width = `${(current / total) * 100}%`;
}

// ══════════════════════════════════════
// FLIP CARD
// ══════════════════════════════════════
function flipCard() {
  isFlipped = !isFlipped;
  cardInner.classList.toggle('flipped', isFlipped);

  if (isFlipped && settings.autoSpeak) {
    setTimeout(() => {
      speak(cards[currentIndex].kana[settings.script]);
      showAutospeakIndicator();
    }, 300);
  }
}

function resetCardToFront() {
  isFlipped = false;
  cardInner.classList.remove('flipped');
  cardInner.style.transform = '';
  cardInner.style.opacity = '1';
}

cardScene.addEventListener('click', (e) => {
  if (e.target === soundBtn || soundBtn.contains(e.target)) return;
  flipCard();
});

// ══════════════════════════════════════
// NEXT / PREV CARD
// ══════════════════════════════════════
function nextCard() {
  if (currentIndex >= cards.length - 1) {
    showComplete();
    return;
  }
  resetCardToFront();
  setTimeout(() => {
    currentIndex++;
    renderCard('right');
  }, 50);
  cancelSpeech();
}

function prevCard() {
  if (currentIndex <= 0) return;
  resetCardToFront();
  setTimeout(() => {
    currentIndex--;
    renderCard('left');
  }, 50);
  cancelSpeech();
}

function showComplete() {
  completeScreen.classList.add('visible');
}

document.getElementById('shuffle-btn').addEventListener('click', () => {
  cards = shuffle(cards);
  currentIndex = 0;
  isFlipped = false;
  renderCard('right');
});

document.getElementById('restart-btn').addEventListener('click', () => {
  completeScreen.classList.remove('visible');
  cards = shuffle(cards);
  currentIndex = 0;
  isFlipped = false;
  renderCard('right');
  updateProgress();
});

// ══════════════════════════════════════
// SWIPE / DRAG
// ══════════════════════════════════════
let touchStartX = 0;
let touchStartY = 0;
let isDragging = false;
let dragX = 0;
const SWIPE_THRESHOLD = 60;

cardScene.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  isDragging = false;
  dragX = 0;
}, { passive: true });

cardScene.addEventListener('touchmove', (e) => {
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;
  
  if (!isDragging && Math.abs(dx) > 8 && Math.abs(dy) < 30) {
    isDragging = true;
    cardScene.classList.add('dragging');
  }
  
  if (isDragging) {
    dragX = dx;
    const opacity = Math.max(0.6, 1 - Math.abs(dragX) / 400);
    cardInner.style.transform = `translateX(${dragX * 0.5}px) scale(${opacity})`;
    cardInner.style.opacity = opacity;
    e.preventDefault();
  }
}, { passive: false });

cardScene.addEventListener('touchend', () => {
  cardScene.classList.remove('dragging');
  cardInner.style.transform = '';
  cardInner.style.opacity = '1';

  if (isDragging) {
    if (dragX < -SWIPE_THRESHOLD) nextCard();
    else if (dragX > SWIPE_THRESHOLD) prevCard();
    isDragging = false;
    dragX = 0;
  }
});

// ══════════════════════════════════════
// MOUSE DRAG (DESKTOP)
// ══════════════════════════════════════
let mouseDown = false;
let mouseStartX = 0;

cardScene.addEventListener('mousedown', (e) => {
  mouseDown = true;
  mouseStartX = e.clientX;
  isDragging = false;
  dragX = 0;
});

window.addEventListener('mousemove', (e) => {
  if (!mouseDown) return;
  const dx = e.clientX - mouseStartX;
  
  if (!isDragging && Math.abs(dx) > 10) {
    isDragging = true;
    cardScene.classList.add('dragging');
  }
  
  if (isDragging) {
    dragX = dx;
    const opacity = Math.max(0.6, 1 - Math.abs(dragX) / 400);
    cardInner.style.transform = `translateX(${dragX * 0.5}px) scale(${opacity})`;
    cardInner.style.opacity = opacity;
  }
});

window.addEventListener('mouseup', () => {
  if (!mouseDown) return;
  mouseDown = false;
  cardScene.classList.remove('dragging');
  cardInner.style.transform = '';
  cardInner.style.opacity = '1';

  if (isDragging) {
    if (dragX < -SWIPE_THRESHOLD) nextCard();
    else if (dragX > SWIPE_THRESHOLD) prevCard();
  }
  isDragging = false;
  dragX = 0;
});

// ══════════════════════════════════════
// KEYBOARD
// ══════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (flashPage.classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') nextCard();
  else if (e.key === 'ArrowLeft') prevCard();
  else if (e.key === ' ' || e.key === 'Enter') flipCard();
});

// ══════════════════════════════════════
// SPEECH SYNTHESIS
// ══════════════════════════════════════
let currentUtterance = null;

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  cancelSpeech();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ja-JP';
  utter.rate = 0.85;
  utter.pitch = 1.0;
  currentUtterance = utter;

  soundBtn.classList.add('playing');
  utter.onend = () => {
    soundBtn.classList.remove('playing');
    currentUtterance = null;
  };
  utter.onerror = () => {
    soundBtn.classList.remove('playing');
    currentUtterance = null;
  };
  speechSynthesis.speak(utter);
}

function cancelSpeech() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  soundBtn.classList.remove('playing');
  currentUtterance = null;
}

soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const kana = cards[currentIndex]?.kana[settings.script];
  if (kana) speak(kana);
});

function showAutospeakIndicator() {
  autospeakIndicator.classList.add('show');
  setTimeout(() => autospeakIndicator.classList.remove('show'), 1500);
}

// ══════════════════════════════════════
// INIT APP
// ══════════════════════════════════════
async function initApp() {
  loadSettings();
  const loaded = await loadAppData();
  if (!loaded) return;

  renderTopicButtons();
  applyHomepageSettings();
}

initApp();