/* ============================================
   AI WELLNESS COPILOT — APPLICATION LOGIC
   v2: Enhanced Mood, Activity Description, LLM Integration
   ============================================ */

// ============ STATE ============
const DEFAULT_API_KEY = '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';
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
const BACKEND_URL = 'http://127.0.0.1:8000';

// ============ BACKEND API HELPERS ============
async function backendPost(endpoint, data) {
  try {
    const resp = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!resp.ok) throw new Error(`Backend ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.warn(`[Backend] POST ${endpoint} failed:`, err.message);
    return null;
  }
}

async function backendGet(endpoint) {
  try {
    const resp = await fetch(`${BACKEND_URL}${endpoint}`);
    if (!resp.ok) throw new Error(`Backend ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.warn(`[Backend] GET ${endpoint} failed:`, err.message);
    return null;
  }
}

let state = {
  user: null,
  currentPage: 'welcome',
  checkin: {
    water: 2,
    sleep: 7,
    activity: 'medium',
    activityDescription: '',
    moods: ['neutral'],
    moodContext: ''
  },
  chatHistory: [],
  history: [],
  insights: null,
  reminders: {}, // Now dynamic
  apiKey: DEFAULT_API_KEY,
  aiModel: DEFAULT_MODEL
};

const REMINDER_TEMPLATES = {
  water: { icon: '💧', title: 'Drink Water', text: 'Stay hydrated! Aim for at least 8 glasses (2-3 liters) of water throughout the day.', time: 'Every 1-2 hours', color: 'water' },
  stretch: { icon: '🧘', title: 'Take a Stretch Break', text: 'Stand up, stretch your arms, neck, and shoulders. Even 2 minutes helps reduce tension.', time: 'Every 45 minutes', color: 'stretch' },
  walk: { icon: '🚶', title: 'Go for a Short Walk', text: 'A 10-15 minute walk boosts energy, creativity, and cardiovascular health.', time: 'After every 2 hours of sitting', color: 'walk' },
  sleep: { icon: '🌙', title: 'Sleep on Time', text: 'Aim for 7-9 hours of quality sleep. Start winding down 30 minutes before bed — no screens!', time: 'Wind down by 10:30 PM', color: 'sleep' },
  eyes: { icon: '👀', title: 'Eye Rest (20-20-20 Rule)', text: 'Every 20 minutes, look at something 20 feet away for 20 seconds to reduce eye strain.', time: 'Every 20 minutes', color: 'eyes' },
  breathe: { icon: '🌬️', title: 'Deep Breathing', text: 'Take 5 deep breaths: inhale for 4 seconds, hold for 4, exhale for 6. Calm your nervous system.', time: 'When feeling stressed', color: 'breathe' },
  sunlight: { icon: '☀️', title: 'Get Some Sunlight', text: 'Spend 10-15 minutes outdoors. Sunlight boosts Vitamin D and improves circadian rhythm.', time: 'Best before 10 AM', color: 'sunlight' },
  posture: { icon: '🪑', title: 'Correct Your Posture', text: 'Sit up straight! Align your ears, shoulders, and hips to prevent long-term back pain.', time: 'Check every 30 minutes', color: 'posture' },
  fruits: { icon: '🍎', title: 'Eat a Healthy Snack', text: 'Grab a piece of fruit or some nuts. Fuel your body with natural nutrients.', time: 'Mid-morning / Afternoon', color: 'fruits' }
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initParticles();
  updateSliderDisplay('water');
  updateSliderDisplay('sleep');

  if (state.user) {
    updateGreeting();
  }

  addSVGDefs();

  // Sync mood buttons with state
  syncMoodButtons();

  // Restore API key & model to modal inputs
  if (state.apiKey) {
    const input = document.getElementById('api-key-input');
    if (input) input.value = state.apiKey;
  }
  if (state.aiModel) {
    const select = document.getElementById('model-select');
    if (select) select.value = state.aiModel;
  }

  console.log('[WellnessCopilot] Initialized. API Key active:', !!state.apiKey, '| Model:', state.aiModel);
});

function loadState() {
  try {
    const saved = localStorage.getItem('wellnessCopilot');
    if (saved) {
      const parsed = JSON.parse(saved);
      
      // Deep merge: preserve top-level and merge nested objects properly
      if (parsed.user !== undefined) state.user = parsed.user;
      if (parsed.currentPage) state.currentPage = parsed.currentPage;
      if (parsed.history) state.history = parsed.history;
      if (parsed.chatHistory) state.chatHistory = parsed.chatHistory;
      if (parsed.insights) state.insights = parsed.insights;
      if (parsed.reminders) state.reminders = { ...state.reminders, ...parsed.reminders };
      
      // Deep merge checkin — preserve new fields, apply saved values
      if (parsed.checkin) {
        if (parsed.checkin.water !== undefined) state.checkin.water = parsed.checkin.water;
        if (parsed.checkin.sleep !== undefined) state.checkin.sleep = parsed.checkin.sleep;
        if (parsed.checkin.activity) state.checkin.activity = parsed.checkin.activity;
        if (parsed.checkin.activityDescription) state.checkin.activityDescription = parsed.checkin.activityDescription;
        if (parsed.checkin.moodContext) state.checkin.moodContext = parsed.checkin.moodContext;
        
        // Handle moods: convert old single-mood string to array
        if (Array.isArray(parsed.checkin.moods) && parsed.checkin.moods.length > 0) {
          state.checkin.moods = parsed.checkin.moods;
        } else if (parsed.checkin.mood && typeof parsed.checkin.mood === 'string') {
          state.checkin.moods = [parsed.checkin.mood];
        }
        // else keep default ['neutral']
      }
      
      // API key: use saved key if present, otherwise always fall back to hardcoded default
      state.apiKey = (parsed.apiKey && parsed.apiKey.trim()) ? parsed.apiKey : DEFAULT_API_KEY;
      state.aiModel = parsed.aiModel || DEFAULT_MODEL;
    }
  } catch (e) {
    console.log('Fresh start — no saved state');
  }
}

function saveState() {
  try {
    localStorage.setItem('wellnessCopilot', JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save state');
  }
}

function addSVGDefs() {
  const svgs = document.querySelectorAll('.score-svg');
  svgs.forEach(svg => {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.id = 'scoreGradient';
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '100%');

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#10b981');

    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#3b82f6');

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);
    svg.prepend(defs);
  });
}

// ============ PARTICLES ============
function initParticles() {
  const container = document.getElementById('hero-particles');
  if (!container) return;

  const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'];

  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.classList.add('particle');
    const size = Math.random() * 6 + 2;
    particle.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration: ${Math.random() * 15 + 10}s;
      animation-delay: ${Math.random() * -20}s;
    `;
    container.appendChild(particle);
  }
}

// ============ NAVIGATION ============
function navigateTo(page) {
  if (page !== 'welcome' && !state.user) {
    showToast('👤 Please enter your name to get started!', 'warning');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.add('active');

  const targetLink = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (targetLink) targetLink.classList.add('active');

  state.currentPage = page;
  document.getElementById('nav-links').classList.remove('open');

  if (page === 'insights') renderInsights();
  if (page === 'dashboard') renderDashboard();
  if (page === 'reminders') renderReminders();
  if (page === 'companion') renderChat();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileNav() {
  document.getElementById('nav-links').classList.toggle('open');
}

// ============ LOGIN ============
function handleLogin() {
  const nameInput = document.getElementById('login-name');
  const name = nameInput.value.trim();

  if (!name) {
    nameInput.focus();
    nameInput.style.borderColor = '#ef4444';
    showToast('✏️ Please enter your name!', 'warning');
    setTimeout(() => { nameInput.style.borderColor = ''; }, 2000);
    return;
  }

  state.user = name;
  saveState();
  updateGreeting();
  showToast(`🎉 Welcome, ${name}! Let's track your wellness.`, 'success');

  setTimeout(() => navigateTo('checkin'), 600);
}

function updateGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  const el = document.getElementById('checkin-greeting');
  if (el && state.user) {
    el.textContent = `${greeting}, ${state.user}! How are you feeling today?`;
  }
}

// ============ CHECK-IN ============
function updateSliderDisplay(type) {
  if (type === 'water') {
    const val = parseFloat(document.getElementById('water-input').value);
    document.getElementById('water-value').textContent = `${val.toFixed(1)}L`;
    state.checkin.water = val;
    renderWaterDrops(val);
  } else if (type === 'sleep') {
    const val = parseFloat(document.getElementById('sleep-input').value);
    document.getElementById('sleep-value').textContent = `${val.toFixed(1)}h`;
    state.checkin.sleep = val;
    updateSleepQuality(val);
  }
}

function renderWaterDrops(val) {
  const container = document.getElementById('water-drops');
  container.innerHTML = '';
  const total = 10;
  const filled = Math.round(val * 2);
  for (let i = 0; i < total; i++) {
    const drop = document.createElement('div');
    drop.classList.add('water-drop', i < filled ? 'filled' : 'empty');
    container.appendChild(drop);
  }
}

function updateSleepQuality(val) {
  const el = document.getElementById('sleep-quality');
  let cls, text;
  if (val >= 7) { cls = 'good'; text = '😴 Good Rest'; }
  else if (val >= 5) { cls = 'fair'; text = '😴 Fair Rest'; }
  else { cls = 'poor'; text = '😫 Insufficient'; }
  el.innerHTML = `<span class="quality-indicator ${cls}">${text}</span>`;
}

function selectActivity(level) {
  state.checkin.activity = level;
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.activity-btn[data-level="${level}"]`).classList.add('active');
}

function updateActivityDescription() {
  state.checkin.activityDescription = document.getElementById('activity-description').value;
}

// ============ ENHANCED MOOD (Multi-select) ============
const MOOD_EMOJIS = {
  happy: '😊', excited: '🤩', neutral: '😐',
  anxious: '😰', tired: '😴', stressed: '😟'
};

function toggleMood(mood) {
  // Ensure moods is always an array
  if (!Array.isArray(state.checkin.moods)) {
    state.checkin.moods = [];
  }
  
  const idx = state.checkin.moods.indexOf(mood);
  if (idx >= 0) {
    // Only remove if there are other moods selected
    if (state.checkin.moods.length > 1) {
      state.checkin.moods.splice(idx, 1);
    }
    // If it's the only mood, keep it (can't have zero moods)
  } else {
    state.checkin.moods.push(mood);
  }

  // Sync button UI
  syncMoodButtons();
  updateSelectedMoodsDisplay();
}

function syncMoodButtons() {
  if (!Array.isArray(state.checkin.moods)) {
    state.checkin.moods = ['neutral'];
  }
  document.querySelectorAll('.mood-btn').forEach(b => {
    const m = b.getAttribute('data-mood');
    if (state.checkin.moods.includes(m)) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
}

function updateSelectedMoodsDisplay() {
  const container = document.getElementById('selected-moods-tags');
  container.innerHTML = state.checkin.moods.map(m =>
    `<span class="mood-tag">${MOOD_EMOJIS[m] || ''} ${capitalizeFirst(m)}</span>`
  ).join(' ');
}

function updateMoodContext() {
  state.checkin.moodContext = document.getElementById('mood-context').value;
}

// Helper: Get primary mood for backward compat
function getPrimaryMood(moods) {
  const priority = ['stressed', 'anxious', 'tired', 'neutral', 'excited', 'happy'];
  for (const p of priority) {
    if (moods.includes(p)) return p;
  }
  return moods[0] || 'neutral';
}

// ============ CHECK-IN SUBMISSION ============
async function submitCheckin() {
  const entry = {
    date: new Date().toISOString(),
    water: state.checkin.water,
    sleep: state.checkin.sleep,
    activity: state.checkin.activity,
    activityDescription: state.checkin.activityDescription,
    moods: [...state.checkin.moods],
    moodContext: state.checkin.moodContext,
    // Keep backward-compatible single mood field for dashboard
    mood: getPrimaryMood(state.checkin.moods)
  };

  // Check if already submitted today
  const today = new Date().toDateString();
  const existingIndex = state.history.findIndex(h => new Date(h.date).toDateString() === today);
  if (existingIndex >= 0) {
    state.history[existingIndex] = entry;
  } else {
    state.history.push(entry);
  }

  if (state.history.length > 30) {
    state.history = state.history.slice(-30);
  }

  // Sync to backend (non-blocking — frontend works even if backend is offline)
  backendPost('/checkin', {
    userId: state.user || 'demo_user',
    water: entry.water,
    sleep: entry.sleep,
    activity: entry.activity,
    mood: entry.mood,
    notes: entry.activityDescription || '',
    moods: entry.moods,
    moodContext: entry.moodContext,
    activityDescription: entry.activityDescription
  }).then(res => {
    if (res) console.log('[Backend] Check-in synced:', res.message);
  });

  // Generate insights: LLM if API key present, otherwise fallback
  const scores = calculateScores(entry);

  if (state.apiKey) {
    // Show loading and navigate
    state.insights = {
      score: scores.wellnessScore,
      burnoutRisk: scores.burnoutRisk,
      burnoutFactors: scores.burnoutFactors,
      aiMessage: '<div class="ai-loading-state"><div class="ai-loading-spinner"></div><p class="ai-loading-text">AI is analyzing your health data...</p></div>',
      tips: [],
      summary: scores.summary,
      metrics: scores.metrics,
      loading: true
    };
    saveState();
    showToast('✅ Check-in submitted! AI is generating personalized insights...', 'success');
    setTimeout(() => navigateTo('insights'), 400);

    // Fetch LLM response asynchronously
    try {
      const llmResponse = await callOpenRouterLLM(entry, scores);
      state.insights.aiMessage = llmResponse.message;
      state.insights.tips = llmResponse.tips;
      state.insights.loading = false;
      saveState();
      // Re-render if still on insights page
      if (state.currentPage === 'insights') {
        const aiMsg = document.getElementById('ai-message');
        aiMsg.innerHTML = state.insights.aiMessage;
        renderTips(state.insights.tips);
      }
    } catch (err) {
      console.error('LLM call failed, using fallback:', err);
      showToast('⚠️ AI service unavailable. Using local analysis.', 'warning');
      const fallback = generateFallbackInsights(entry, scores);
      state.insights.aiMessage = fallback.aiMessage;
      state.insights.tips = fallback.tips;
      state.insights.loading = false;
      saveState();
      if (state.currentPage === 'insights') {
        const aiMsg = document.getElementById('ai-message');
        aiMsg.innerHTML = state.insights.aiMessage;
        renderTips(state.insights.tips);
      }
    }
  } else {
    // No API key: use fallback rule-based (but enhanced)
    const fallback = generateFallbackInsights(entry, scores);
    state.insights = {
      score: scores.wellnessScore,
      burnoutRisk: scores.burnoutRisk,
      burnoutFactors: scores.burnoutFactors,
      aiMessage: fallback.aiMessage,
      tips: fallback.tips,
      summary: scores.summary,
      metrics: scores.metrics,
      loading: false
    };
    saveState();
    showToast('✅ Check-in submitted! Generating AI insights...', 'success');
    showToast('💡 Tip: Add an OpenRouter API key in ⚙️ Settings for deeper AI insights!', 'info');
    setTimeout(() => navigateTo('insights'), 800);
  }
}

// ============ SCORE CALCULATION ============
function calculateScores(entry) {
  const { water, sleep, activity, moods } = entry;

  const waterScore = Math.min((water / 3) * 100, 100);
  const sleepScore = sleep >= 7 && sleep <= 9 ? 100 : sleep >= 6 ? 75 : sleep >= 5 ? 50 : 25;
  const activityScore = activity === 'high' ? 100 : activity === 'medium' ? 65 : 30;

  // Mood score considers multiple moods
  const moodScores = { happy: 100, excited: 90, neutral: 55, tired: 35, anxious: 25, stressed: 20 };
  const avgMoodScore = moods.reduce((sum, m) => sum + (moodScores[m] || 50), 0) / moods.length;
  const moodScore = Math.round(avgMoodScore);

  const wellnessScore = Math.round(
    waterScore * 0.25 + sleepScore * 0.30 + activityScore * 0.20 + moodScore * 0.25
  );

  let burnoutFactors = [];
  if (sleep < 6) burnoutFactors.push('sleep deprivation');
  if (moods.includes('stressed')) burnoutFactors.push('elevated stress');
  if (moods.includes('anxious')) burnoutFactors.push('anxiety');
  if (activity === 'low') burnoutFactors.push('sedentary behavior');
  if (water < 1.5) burnoutFactors.push('dehydration');
  if (moods.includes('tired')) burnoutFactors.push('fatigue');

  let burnoutRisk = 'Low';
  if (burnoutFactors.length >= 3) burnoutRisk = 'High';
  else if (burnoutFactors.length >= 1) burnoutRisk = 'Medium';

  let summary = '';
  if (wellnessScore >= 80) summary = 'Excellent! You\'re taking great care of yourself. Keep it up!';
  else if (wellnessScore >= 60) summary = 'You\'re doing well, but there\'s room for improvement.';
  else if (wellnessScore >= 40) summary = 'Your wellness needs attention. Focus on the areas below.';
  else summary = 'Your wellness metrics need urgent attention. Please prioritize self-care.';

  return {
    wellnessScore,
    burnoutRisk,
    burnoutFactors,
    summary,
    metrics: {
      water: { score: waterScore, status: getWaterStatus(water) },
      sleep: { score: sleepScore, status: getSleepStatus(sleep) },
      activity: { score: activityScore, status: getActivityStatus(activity) },
      mood: { score: moodScore, status: getMoodStatusMulti(moods) }
    }
  };
}

// ============ OPENROUTER LLM INTEGRATION ============
async function callOpenRouterLLM(entry, scores) {
  const { water, sleep, activity, activityDescription, moods, moodContext } = entry;

  const moodsList = moods.map(m => `${MOOD_EMOJIS[m]} ${capitalizeFirst(m)}`).join(', ');

  const prompt = `You are an empathetic AI Wellness Copilot for students and working professionals. Analyze the following daily health check-in data and provide a personalized, warm, and insightful wellness assessment.

## User: ${state.user}
## Today's Check-in Data:
- **Water Intake:** ${water}L (recommended: 2-3L)
- **Sleep:** ${sleep} hours (optimal: 7-9 hours)
- **Physical Activity Level:** ${capitalizeFirst(activity)}${activityDescription ? `\n- **Activity Details:** "${activityDescription}"` : ''}
- **Current Mood(s):** ${moodsList}${moodContext ? `\n- **Mood Context:** "${moodContext}"` : ''}

## Calculated Metrics:
- Wellness Score: ${scores.wellnessScore}/100
- Burnout Risk: ${scores.burnoutRisk}${scores.burnoutFactors.length > 0 ? ` (factors: ${scores.burnoutFactors.join(', ')})` : ''}

## Instructions:
1. Address the user by name (${state.user}) warmly.
2. Give a holistic assessment that connects the different metrics — don't just analyze each one in isolation.
3. If the user shared mood context or activity details, incorporate those deeply into your analysis. For example, if they mention exam stress + excitement from winning a hackathon, acknowledge the complexity of mixed emotions.
4. Provide specific, actionable, and empathetic advice — not generic health tips.
5. If burnout risk is Medium or High, give a clear but caring warning with concrete next steps.
6. Keep the tone friendly, supportive, and non-judgmental — like a caring wellness coach.
7. Use appropriate emojis sparingly for warmth.
8. Format your response in well-structured paragraphs (use <p> tags for each paragraph). Keep it around 4-6 paragraphs.

Also generate exactly 4-6 personalized health tips. Format them as a JSON array at the very end of your response, on its own line, in this exact format:
TIPS_JSON:[{"icon":"emoji","title":"short title","text":"actionable tip under 80 chars"}]`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.apiKey}`,
      'HTTP-Referer': window.location.origin || 'http://localhost:8080',
      'X-Title': 'AI Wellness Copilot'
    },
    body: JSON.stringify({
      model: state.aiModel,
      messages: [
        {
          role: 'system',
          content: 'You are an empathetic AI wellness coach. Provide personalized, insightful health analysis. Always format your wellness message with HTML <p> tags. At the very end, include tips in the exact format: TIPS_JSON:[{...}]'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 1200
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`API Error ${response.status}: ${errData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const fullText = data.choices?.[0]?.message?.content || '';

  // Parse tips from the response
  let tips = [];
  let message = fullText;

  const tipsMatch = fullText.match(/TIPS_JSON:\s*(\[[\s\S]*?\])/);
  if (tipsMatch) {
    try {
      tips = JSON.parse(tipsMatch[1]);
      message = fullText.replace(/TIPS_JSON:\s*\[[\s\S]*?\]/, '').trim();
    } catch (e) {
      console.warn('Could not parse tips JSON:', e);
    }
  }

  // Ensure the message has <p> tags
  if (!message.includes('<p>')) {
    message = message.split('\n\n').filter(p => p.trim()).map(p => `<p>${p.trim()}</p>`).join('');
  }

  // Fallback tips if parsing failed
  if (tips.length === 0) {
    tips = generateFallbackTips(entry);
  }

  return { message, tips };
}

// ============ FALLBACK (Rule-Based) INSIGHTS ============
function generateFallbackInsights(entry, scores) {
  const aiMessage = generateFallbackMessage(entry, scores);
  const tips = generateFallbackTips(entry);
  return { aiMessage, tips };
}

function generateFallbackMessage(entry, scores) {
  const { water, sleep, activity, activityDescription, moods, moodContext } = entry;
  const { wellnessScore, burnoutRisk, burnoutFactors } = scores;
  let parts = [];

  // Opening
  if (wellnessScore >= 80) {
    parts.push(`Great job, ${state.user}! 🌟 Your wellness score of ${wellnessScore}/100 shows you're treating your body and mind well today.`);
  } else if (wellnessScore >= 60) {
    parts.push(`Hey ${state.user}, your wellness score is ${wellnessScore}/100 — solid effort, but let's see how we can level up! 💪`);
  } else {
    parts.push(`${state.user}, I noticed your wellness score is ${wellnessScore}/100 today. Let's work on improving that together. 🤝`);
  }

  // Water analysis
  if (water < 1.5) {
    parts.push(`⚠️ Your water intake of ${water}L is well below the recommended 2-3 liters. Dehydration impacts concentration, energy, and mood. Try keeping a water bottle visible at your desk.`);
  } else if (water < 2.5) {
    parts.push(`💧 You've had ${water}L of water — almost there! Adding ${(3 - water).toFixed(1)}L more would hit the sweet spot. Try lemon or cucumber infusions for variety.`);
  } else {
    parts.push(`💧 Excellent hydration at ${water}L! Your body is well-fueled for peak performance.`);
  }

  // Sleep analysis
  if (sleep < 5) {
    parts.push(`🚨 Only ${sleep} hours of sleep is critically low. This weakens your immune system, impairs memory, and raises stress hormones. Try setting a firm bedtime tonight.`);
  } else if (sleep < 7) {
    parts.push(`🌙 ${sleep} hours of sleep falls short of the 7-9 hour recommendation. Even one extra hour can dramatically improve focus and emotional resilience.`);
  } else if (sleep > 9) {
    parts.push(`🌙 ${sleep} hours of sleep — rest is great, but oversleeping may affect energy levels. Aim for the 7-9 hour range for optimal cognition.`);
  } else {
    parts.push(`🌙 ${sleep} hours of quality sleep puts you in the ideal range. Your brain and body will thank you!`);
  }

  // Activity analysis with description
  if (activity === 'low') {
    let actMsg = `🏃 Your activity level is low today.`;
    if (activityDescription) {
      actMsg += ` You mentioned: "${activityDescription}" — even small movements count, so that's a good start! Try adding a 15-minute walk.`;
    } else {
      actMsg += ` Even a 15-minute walk can boost endorphins, reduce stress, and improve cardiovascular health.`;
    }
    parts.push(actMsg);
  } else if (activity === 'medium') {
    let actMsg = `🏃 Good effort on physical activity!`;
    if (activityDescription) {
      actMsg += ` Great work with: "${activityDescription}". To boost further, try adding 10 more minutes of varied movement.`;
    } else {
      actMsg += ` To level up, try adding 10 more minutes of movement — yoga, a walk, or even a dance break.`;
    }
    parts.push(actMsg);
  } else {
    let actMsg = `🏃 Amazing activity level today!`;
    if (activityDescription) {
      actMsg += ` Impressive: "${activityDescription}". Make sure to fuel properly and allow recovery time.`;
    } else {
      actMsg += ` High-intensity exercise strengthens your cardiovascular system and naturally reduces stress.`;
    }
    parts.push(actMsg);
  }

  // Multi-mood analysis with context
  const moodsStr = moods.map(m => capitalizeFirst(m)).join(', ');
  if (moods.length > 1) {
    let moodMsg = `🎭 I see you're experiencing a mix of emotions today: ${moodsStr}.`;
    if (moodContext) {
      moodMsg += ` You shared: "${moodContext}" — it's completely valid to feel multiple things at once. Life is complex, and so are our emotions.`;
    } else {
      moodMsg += ` Mixed emotions are completely normal and show emotional awareness. The fact that you're tracking them is a great step.`;
    }
    parts.push(moodMsg);
  } else {
    const mood = moods[0];
    if (mood === 'stressed' || mood === 'anxious') {
      let moodMsg = `😟 You're feeling ${mood}${moodContext ? `. You shared: "${moodContext}"` : ''}.`;
      moodMsg += ` This is valid and common. Try box breathing (4-4-4-4), journaling, or talking to someone you trust.`;
      parts.push(moodMsg);
    } else if (mood === 'tired') {
      parts.push(`😴 Feeling tired${moodContext ? ` — "${moodContext}"` : ''}. Listen to your body — it's asking for rest. Consider a short power nap (15-20 min) or gentle stretching.`);
    } else if (mood === 'neutral') {
      parts.push(`😐 Feeling neutral${moodContext ? ` — "${moodContext}"` : ''}. To boost your mood naturally, try sunlight, music, or connecting with a friend.`);
    } else if (mood === 'excited') {
      parts.push(`🤩 You're feeling excited${moodContext ? ` — "${moodContext}"` : ''}! Channel this energy positively and savor the moment.`);
    } else {
      parts.push(`😊 Wonderful — you're in a great mood${moodContext ? ` because: "${moodContext}"` : ''}! Positive emotions strengthen immunity and resilience.`);
    }
  }

  // Burnout warning
  if (burnoutRisk === 'High') {
    parts.push(`🔥 <strong>Burnout Alert:</strong> Multiple risk factors detected (${burnoutFactors.join(', ')}). Please prioritize rest and self-care. Consider stepping away from work/study for something enjoyable.`);
  } else if (burnoutRisk === 'Medium') {
    parts.push(`⚡ <strong>Heads up:</strong> Some burnout indicators present (${burnoutFactors.join(', ')}). Address these proactively to protect your wellbeing.`);
  }

  return parts.map(p => `<p>${p}</p>`).join('');
}

function generateFallbackTips(entry) {
  const tips = [];
  const { water, sleep, activity, moods } = entry;

  if (water < 2) tips.push({ icon: '💧', title: 'Hydration Boost', text: 'Set hourly water reminders. Add fruit infusions for variety.' });
  if (water >= 2.5) tips.push({ icon: '💧', title: 'Hydration Star', text: 'Great hydration! Maintain this habit — your body thanks you.' });
  if (sleep < 7) tips.push({ icon: '🌙', title: 'Sleep Schedule', text: 'Create a wind-down routine: dim lights, no screens, warm tea 30 min before bed.' });
  if (sleep >= 7 && sleep <= 9) tips.push({ icon: '✨', title: 'Sleep Champion', text: 'Optimal sleep! Consistent schedules strengthen your circadian rhythm.' });
  if (activity === 'low') {
    tips.push({ icon: '🚶', title: 'Movement Matters', text: 'Start with a 10-minute walk. Small steps lead to big changes.' });
    tips.push({ icon: '🧘', title: 'Desk Stretches', text: 'Do neck rolls, shoulder shrugs, and wrist stretches every hour.' });
  }
  if (activity === 'high') tips.push({ icon: '💪', title: 'Recovery Time', text: 'After intense exercise, focus on nutrition and rest for recovery.' });

  if (moods.includes('stressed') || moods.includes('anxious')) {
    tips.push({ icon: '🌬️', title: 'Breathing Exercise', text: 'Try 4-7-8 breathing: inhale 4s, hold 7s, exhale 8s. Repeat 4 times.' });
    tips.push({ icon: '📝', title: 'Stress Journal', text: 'Write 3 stressors and 3 things you\'re grateful for.' });
  }
  if (moods.includes('tired')) tips.push({ icon: '☕', title: 'Energy Boost', text: 'A 20-min power nap or 10-min walk is better than caffeine.' });
  if (moods.includes('happy') || moods.includes('excited')) tips.push({ icon: '🌟', title: 'Spread the Joy', text: 'Share your good energy! A kind message can brighten someone\'s day.' });

  tips.push({ icon: '🥗', title: 'Mindful Eating', text: 'Include colorful veggies, lean protein, and whole grains in your next meal.' });
  if (tips.length < 4) tips.push({ icon: '☀️', title: 'Sunlight Boost', text: 'Get 10-15 minutes of sunlight to boost Vitamin D and serotonin.' });

  return tips.slice(0, 6);
}

// ============ STATUS HELPERS ============
function getWaterStatus(val) {
  if (val >= 3) return { text: 'Excellent', color: '#10b981' };
  if (val >= 2) return { text: 'Good', color: '#3b82f6' };
  if (val >= 1) return { text: 'Low', color: '#f59e0b' };
  return { text: 'Critical', color: '#ef4444' };
}

function getSleepStatus(val) {
  if (val >= 7 && val <= 9) return { text: 'Optimal', color: '#10b981' };
  if (val >= 6) return { text: 'Fair', color: '#f59e0b' };
  return { text: 'Poor', color: '#ef4444' };
}

function getActivityStatus(val) {
  if (val === 'high') return { text: 'Active', color: '#10b981' };
  if (val === 'medium') return { text: 'Moderate', color: '#3b82f6' };
  return { text: 'Sedentary', color: '#f59e0b' };
}

function getMoodStatusMulti(moods) {
  const positive = moods.some(m => ['happy', 'excited'].includes(m));
  const negative = moods.some(m => ['stressed', 'anxious', 'tired'].includes(m));

  if (positive && negative) return { text: 'Mixed', color: '#f59e0b' };
  if (positive) return { text: 'Positive', color: '#10b981' };
  if (negative) return { text: 'Stressed', color: '#ef4444' };
  return { text: 'Neutral', color: '#f59e0b' };
}

// Keep backward compat
function getMoodStatus(val) {
  if (val === 'happy' || val === 'excited') return { text: 'Positive', color: '#10b981' };
  if (val === 'neutral') return { text: 'Neutral', color: '#f59e0b' };
  return { text: 'Stressed', color: '#ef4444' };
}

// ============ RENDER: INSIGHTS ============
function renderInsights() {
  const hasData = state.insights !== null;
  document.getElementById('insights-empty').style.display = hasData ? 'none' : 'block';
  document.getElementById('insights-content').style.display = hasData ? 'block' : 'none';

  if (!hasData) return;

  const ins = state.insights;

  animateScore(ins.score);

  const burnoutBadge = document.getElementById('burnout-badge');
  burnoutBadge.className = `burnout-badge ${ins.burnoutRisk.toLowerCase()}`;
  document.getElementById('burnout-level').textContent = ins.burnoutRisk;
  document.getElementById('score-summary').textContent = ins.summary;

  // AI Message
  const aiMsg = document.getElementById('ai-message');
  if (ins.loading) {
    aiMsg.innerHTML = ins.aiMessage;
  } else {
    aiMsg.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    setTimeout(() => { aiMsg.innerHTML = ins.aiMessage; }, 800);
  }

  setTimeout(() => {
    renderMetric('water', ins.metrics.water);
    renderMetric('sleep', ins.metrics.sleep);
    renderMetric('activity', ins.metrics.activity);
    renderMetric('mood', ins.metrics.mood);
  }, 400);

  if (ins.tips && ins.tips.length > 0) {
    renderTips(ins.tips);
  }
}

function animateScore(target) {
  const scoreEl = document.getElementById('wellness-score');
  const circleEl = document.getElementById('score-circle');
  const circumference = 2 * Math.PI * 85;

  let current = 0;
  const duration = 1500;
  const startTime = performance.now();

  function animate(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    current = Math.round(target * eased);
    scoreEl.textContent = current;

    const offset = circumference - (circumference * current / 100);
    circleEl.style.strokeDasharray = circumference;
    circleEl.style.strokeDashoffset = offset;

    if (progress < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

function renderMetric(type, data) {
  const fill = document.getElementById(`metric-${type}-fill`);
  const status = document.getElementById(`metric-${type}-status`);
  fill.style.width = `${data.score}%`;
  status.textContent = data.status.text;
  status.style.color = data.status.color;
}

function renderTips(tips) {
  const grid = document.getElementById('tips-grid');
  grid.innerHTML = tips.map(tip => `
    <div class="tip-card">
      <span class="tip-icon">${tip.icon}</span>
      <div class="tip-content">
        <h4>${tip.title}</h4>
        <p>${tip.text}</p>
      </div>
    </div>
  `).join('');
}

// ============ RENDER: DASHBOARD ============
function renderDashboard() {
  const hasData = state.history.length > 0;
  document.getElementById('dashboard-empty').style.display = hasData ? 'none' : 'block';
  document.getElementById('dashboard-content').style.display = hasData ? 'block' : 'none';

  if (!hasData) return;

  const latest = state.history[state.history.length - 1];
  const score = state.insights ? state.insights.score : 0;

  animateDashScore(score);

  const label = document.getElementById('dash-score-label');
  if (score >= 80) label.textContent = 'Excellent';
  else if (score >= 60) label.textContent = 'Good';
  else if (score >= 40) label.textContent = 'Fair';
  else label.textContent = 'Needs Attention';

  document.getElementById('qs-water').textContent = `${latest.water}L`;
  document.getElementById('qs-sleep').textContent = `${latest.sleep}h`;
  document.getElementById('qs-activity').textContent = capitalizeFirst(latest.activity);
  document.getElementById('qs-mood').textContent = getMoodEmoji(latest.mood) + ' ' + capitalizeFirst(latest.mood);

  renderWaterChart(latest.water);
  renderSleepChart();
  renderMoodTrend();
  renderActivityChart();
}

function animateDashScore(target) {
  const numEl = document.getElementById('dash-score-num');
  const fillEl = document.getElementById('dash-score-fill');
  const circumference = 2 * Math.PI * 52;

  let current = 0;
  const duration = 1500;
  const startTime = performance.now();

  function animate(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    current = Math.round(target * eased);
    numEl.textContent = current;

    const offset = circumference - (circumference * current / 100);
    fillEl.style.strokeDasharray = circumference;
    fillEl.style.strokeDashoffset = offset;

    if (progress < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

function renderWaterChart(waterVal) {
  const level = document.getElementById('water-level');
  const current = document.getElementById('water-current');
  const progressFill = document.getElementById('water-progress-fill');

  level.style.height = `${Math.min((waterVal / 5) * 100, 100)}%`;
  current.textContent = `${waterVal}L`;
  progressFill.style.width = `${Math.min((waterVal / 3) * 100, 100)}%`;
}

function renderSleepChart() {
  const chart = document.getElementById('sleep-chart');
  const last7 = state.history.slice(-7);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const chartData = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayName = days[date.getDay()];
    const entry = last7.find(h => new Date(h.date).toDateString() === date.toDateString());
    const sleep = entry ? entry.sleep : (i === 0 && last7.length > 0 ? last7[last7.length - 1].sleep : null);
    chartData.push({ day: dayName, sleep });
  }

  chart.innerHTML = chartData.map(d => {
    if (d.sleep === null) return `<div class="bar-item"><span class="bar-value">--</span><div class="bar" style="height:4px;background:rgba(255,255,255,0.06);"></div><span class="bar-label">${d.day}</span></div>`;
    const height = (d.sleep / 12) * 140;
    const cls = d.sleep >= 7 ? 'optimal' : 'warning';
    return `<div class="bar-item"><span class="bar-value">${d.sleep}h</span><div class="bar ${cls}" style="height:${height}px;"></div><span class="bar-label">${d.day}</span></div>`;
  }).join('');
}

function renderMoodTrend() {
  const container = document.getElementById('mood-trend');
  const last7 = state.history.slice(-7);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const moodData = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const entry = last7.find(h => new Date(h.date).toDateString() === date.toDateString());
    moodData.push({ day: days[date.getDay()], mood: entry ? entry.mood : null });
  }

  container.innerHTML = moodData.map(d => {
    const emoji = d.mood ? getMoodEmoji(d.mood) : '·';
    const height = d.mood === 'happy' || d.mood === 'excited' ? '100%' : d.mood === 'neutral' ? '60%' : d.mood === 'stressed' || d.mood === 'anxious' ? '30%' : d.mood === 'tired' ? '40%' : '10%';
    return `<div class="mood-item" style="height:${height};"><span class="mood-dot">${emoji}</span><span class="mood-day">${d.day}</span></div>`;
  }).join('');
}

function renderActivityChart() {
  const container = document.getElementById('activity-chart');
  const last5 = state.history.slice(-5);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const actData = [];
  for (let i = 4; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const entry = last5.find(h => new Date(h.date).toDateString() === date.toDateString());
    actData.push({ day: days[date.getDay()], activity: entry ? entry.activity : null });
  }

  container.innerHTML = actData.map(d => {
    const width = d.activity === 'high' ? '100%' : d.activity === 'medium' ? '65%' : d.activity === 'low' ? '30%' : '5%';
    const label = d.activity ? capitalizeFirst(d.activity) : '--';
    const cls = d.activity || '';
    return `<div class="activity-bar-item"><span class="activity-day">${d.day}</span><div class="activity-bar-track"><div class="activity-bar-fill ${cls}" style="width:${width};">${label}</div></div></div>`;
  }).join('');
}

// ============ REMINDERS ============
function getActiveReminderTypes() {
  const checkin = state.checkin;
  const types = new Set();

  // Logic to prioritize reminders based on check-in data
  if (checkin.moods.includes('stressed') || checkin.moods.includes('anxious')) types.add('breathe');
  if (checkin.water < 2.5) types.add('water');
  if (checkin.sleep < 7) types.add('sleep');
  if (checkin.activity === 'low') types.add('walk');
  
  // High utility ones
  types.add('eyes');
  types.add('stretch');
  
  if (checkin.moods.includes('tired')) types.add('sunlight');
  if (checkin.activity === 'medium' || checkin.activity === 'high') types.add('fruits');
  
  if (checkin.activity === 'low' || (checkin.activityDescription && checkin.activityDescription.toLowerCase().includes('sit'))) {
    types.add('posture');
  }

  // Fallback and sort
  const allTemplates = Object.keys(REMINDER_TEMPLATES);
  let idx = 0;
  while (types.size < 6 && idx < allTemplates.length) {
    types.add(allTemplates[idx]);
    idx++;
  }

  return Array.from(types).slice(0, 6);
}

function renderReminders() {
  const container = document.getElementById('reminders-grid');
  if (!container) return;

  const activeTypes = getActiveReminderTypes();
  let completedCount = 0;

  // Update subtitle with personalized context
  const subtitle = document.getElementById('reminders-subtitle');
  if (subtitle) {
    const hasHistory = state.history.length > 0;
    if (hasHistory) {
      const reasons = [];
      if (state.checkin.water < 2.5) reasons.push('low hydration');
      if (state.checkin.sleep < 7) reasons.push('limited sleep');
      if (state.checkin.moods.includes('stressed') || state.checkin.moods.includes('anxious')) reasons.push('stress levels');
      if (state.checkin.activity === 'low') reasons.push('low activity');
      if (state.checkin.moods.includes('tired')) reasons.push('fatigue');
      
      if (reasons.length > 0) {
        subtitle.textContent = `Personalized for you based on: ${reasons.join(', ')} 🎯`;
      } else {
        subtitle.textContent = `Great habits today, ${state.user || 'friend'}! Here are reminders to maintain your streak ✨`;
      }
    } else {
      subtitle.textContent = 'Complete a check-in to get personalized wellness nudges';
    }
  }

  container.innerHTML = activeTypes.map(type => {
    const template = REMINDER_TEMPLATES[type];
    const isCompleted = state.reminders[type] || false;
    if (isCompleted) completedCount++;

    return `
      <div class="reminder-card glass-card reminder-${type} ${isCompleted ? 'dismissed' : ''}" id="reminder-${type}">
        <div class="reminder-glow"></div>
        <div class="reminder-icon-wrap">
          <span class="reminder-icon">${template.icon}</span>
        </div>
        <div class="reminder-body">
          <h3>${template.title}</h3>
          <p>${template.text}</p>
          <div class="reminder-time">
            <span class="time-icon">⏰</span>
            <span>${template.time}</span>
          </div>
        </div>
        <div class="reminder-action">
          <button class="btn btn-sm btn-outline" onclick="dismissReminder('${type}')">
            <span id="reminder-${type}-btn-text">${isCompleted ? '↺ Undo' : '✓ Done'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  const progressFill = document.getElementById('habit-progress-fill');
  const progressText = document.getElementById('habit-progress-text');
  
  if (progressFill) progressFill.style.width = `${(completedCount / activeTypes.length) * 100}%`;
  if (progressText) progressText.textContent = `${completedCount} of ${activeTypes.length} completed`;
}

function dismissReminder(type) {
  state.reminders[type] = !state.reminders[type];
  saveState();
  if (state.reminders[type]) showToast(`✅ "${capitalizeFirst(type)}" habit completed!`, 'success');
  renderReminders();
}

// ============ API KEY MODAL ============
function openApiKeyModal() {
  const modal = document.getElementById('api-key-modal');
  modal.style.display = 'flex';

  const input = document.getElementById('api-key-input');
  const select = document.getElementById('model-select');
  const status = document.getElementById('api-key-status');

  if (state.apiKey) {
    input.value = state.apiKey;
    status.className = 'api-key-status connected';
    status.textContent = '✅ API key is active — LLM-powered insights enabled';
  } else {
    input.value = '';
    status.className = 'api-key-status';
    status.textContent = '';
  }

  if (state.aiModel) select.value = state.aiModel;
}

function closeApiKeyModal() {
  document.getElementById('api-key-modal').style.display = 'none';
}

function saveApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  const model = document.getElementById('model-select').value;
  const status = document.getElementById('api-key-status');

  if (!key) {
    // Clear API key (go back to rule-based)
    state.apiKey = '';
    state.aiModel = model;
    saveState();
    status.className = 'api-key-status';
    status.textContent = '';
    showToast('🔄 Switched to rule-based insights.', 'info');
    closeApiKeyModal();
    return;
  }

  state.apiKey = key;
  state.aiModel = model;
  saveState();

  status.className = 'api-key-status connected';
  status.textContent = `✅ API key saved! Model: ${model.split('/')[1] || model}`;

  showToast('🧠 AI integration activated! Your next check-in will use LLM-powered insights.', 'success');

  setTimeout(() => closeApiKeyModal(), 1200);
}

// ============ AI COMPANION ============
function renderChat() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  // Initialize with greeting if empty
  if (state.chatHistory.length === 0) {
    state.chatHistory.push({
      role: 'ai',
      text: "Hi there! I'm your AI Wellness Companion. How are you feeling right now? I'm here to listen and help you manage stress or build healthy habits."
    });
    saveState();
  }

  container.innerHTML = state.chatHistory.map(msg => {
    if (msg.role === 'ai') {
      return `
        <div class="message-ai">
          <div class="msg-avatar">🤖</div>
          <div class="msg-bubble">${msg.text}</div>
        </div>
      `;
    } else {
      return `
        <div class="message-user">
          <div class="msg-avatar">${state.user ? state.user.charAt(0).toUpperCase() : 'U'}</div>
          <div class="msg-bubble"><p>${msg.text}</p></div>
        </div>
      `;
    }
  }).join('');
  
  // Auto scroll
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const inputEl = document.getElementById('chat-input');
  const text = inputEl.value.trim();
  if (!text) return;

  // Add user message
  state.chatHistory.push({ role: 'user', text: text });
  inputEl.value = '';
  saveState();
  renderChat();

  // Add loading indicator
  const container = document.getElementById('chat-messages');
  const loadingHtml = `
    <div class="message-ai" id="chat-loading-msg">
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">
        <div class="chat-loading"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', loadingHtml);
  container.scrollTop = container.scrollHeight;

  try {
    // Try backend first, fallback to direct LLM call
    let aiResponse = null;
    const backendResp = await backendPost('/chat', {
      message: text,
      context: {
        sleep: state.checkin.sleep,
        water: state.checkin.water,
        activity: state.checkin.activity,
        mood: getPrimaryMood(state.checkin.moods)
      }
    });
    if (backendResp && backendResp.reply) {
      aiResponse = backendResp.reply;
      console.log('[Backend] Chat sentiment:', backendResp.sentiment);
    } else {
      aiResponse = await callCompanionLLM(text);
    }
    
    // Remove loading
    const loadingEl = document.getElementById('chat-loading-msg');
    if (loadingEl) loadingEl.remove();

    // Add AI response
    state.chatHistory.push({ role: 'ai', text: aiResponse });
    saveState();
    renderChat();
  } catch (err) {
    console.error('Companion LLM error:', err);
    const loadingEl = document.getElementById('chat-loading-msg');
    if (loadingEl) loadingEl.remove();
    
    const fallbackText = "I'm having trouble connecting right now, but I'm here for you! Taking a few deep breaths (4 seconds in, 4 seconds out) can really help center your mind.";
    state.chatHistory.push({ role: 'ai', text: `<p>${fallbackText}</p>` });
    saveState();
    renderChat();
  }
}

async function callCompanionLLM(userMessage) {
  if (!state.apiKey) {
    throw new Error('No API key configured for Companion');
  }

  // Build context from checkin
  const { water, sleep, activity, moods } = state.checkin;
  const moodsList = moods.map(m => capitalizeFirst(m)).join(', ');
  
  const systemPrompt = `You are a supportive AI wellness companion. Your goal is to help users manage stress, improve wellbeing, and encourage healthy habits. 

First, perform a quick, invisible sentiment analysis on the user's message (detecting Stress, Anxiety, Burnout, Sadness, Neutral, Positive) to guide your tone, but don't state the category directly.

User Context:
- Name: ${state.user || 'Friend'}
- Sleep today: ${sleep} hours
- Hydration: ${water}L
- Activity Level: ${activity}
- Daily Mood Check-in: ${moodsList}

Instructions:
1. Provide a short, empathetic response to the user's message.
2. Acknowledge their feelings without judgment.
3. Suggest 1–3 small actionable steps (e.g., a 2-minute breathing exercise, a short walk, drinking water, stepping away from screens, or journaling).
4. Do NOT provide medical diagnoses.
5. Format your response with HTML <p> tags for paragraphs and <ul>/<li> for actionable steps. Keep it conversational and warm.`;

  // Provide only the last 6 messages as conversation history to save tokens
  const conversationHistory = state.chatHistory.slice(-6).map(msg => ({
    role: msg.role === 'ai' ? 'assistant' : 'user',
    content: msg.text.replace(/<[^>]*>?/gm, '') // Strip HTML for history
  }));

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.apiKey}`,
      'HTTP-Referer': window.location.origin || 'http://localhost:8080',
      'X-Title': 'AI Wellness Copilot Companion'
    },
    body: JSON.stringify({
      model: state.aiModel,
      messages: messages,
      temperature: 0.7,
      max_tokens: 600
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`API Error ${response.status}: ${errData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  let aiText = data.choices?.[0]?.message?.content || '';
  
  // Ensure formatted with paragraphs if missing
  if (!aiText.includes('<p>')) {
    aiText = aiText.split('\n\n').filter(p => p.trim()).map(p => `<p>${p.trim()}</p>`).join('');
  }
  
  return aiText;
}

// ============ UTILS ============
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getMoodEmoji(mood) {
  return MOOD_EMOJIS[mood] || '·';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============ KEYBOARD SUPPORT ============
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (state.currentPage === 'welcome') {
      handleLogin();
    } else if (state.currentPage === 'companion') {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.id === 'chat-input') {
        sendChatMessage();
      }
    }
  }
  if (e.key === 'Escape') {
    closeApiKeyModal();
  }
});
