/* ═══════════════════════════════════════════════════════
   Monthly Disciplined — Data Layer
   ═══════════════════════════════════════════════════════ */

(function() {
  const STORAGE_KEY = '70hard_state';

  const defaultState = {
    version: 1,
    programStart: null,
    programLengthDays: 30,
    days: {},
    streak: {
      current: 0,
      longest: 0,
      lastCompletedDate: null
    },
    mulligansUsed: 0,
    settings: {
      bedtimeTarget: "23:00",
      wakeTarget: "06:30",
      graceWindowMin: 15,
      proteinGoal: 175,
      calorieCeiling: 2700,
      waterGoal: 120,
      waterBottleSize: 40
    }
  };

  const defaultDayTasks = {
    workout: {
      activeMinutes: false,
      steps: false,
      caloriesBurned: false
    },
    photo: false,
    diet: {
      slowCarbCompliant: false,
      cheatDay: false
    },
    water: false,
    bible: false,
    sleep: {
      bedtimeHit: false,
      wakeHit: false
    },
    freePasses: {
      workout: false,
      photo: false,
      water: false,
      bible: false,
      sleep: false,
      slowCarbCompliant: false
    },
    celebrationFired: false
  };

  // 1. initState()
  function initState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse state from localStorage, falling back to default.', e);
    }
    return JSON.parse(JSON.stringify(defaultState));
  }

  // 2. saveState()
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(window.App.state));
    } catch (e) {
      console.error('Failed to save state to localStorage', e);
    }
  }

  // 3. getTodayKey()
  function getTodayKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 4. getTodayRecord()
  function getTodayRecord(key = getTodayKey()) {
    if (!window.App.state.days[key]) {
      const dayNum = getDayNumber(key);
      const isSetup = window.App.state.currentPhase === 'setup';
      
      window.App.state.days[key] = {
        phase: isSetup ? 'phase1' : window.App.state.currentPhase,
        dayNumber: dayNum > 0 ? dayNum : 1,
        completed: false,
        tasks: JSON.parse(JSON.stringify(defaultDayTasks)),
        notes: "",
        weight: null,
        caloriesLogged: null,
        proteinLogged: null
      };
      
      saveState();
    }
    const record = window.App.state.days[key];
    // Migrate old boolean workout to new object format
    if (record && record.tasks && typeof record.tasks.workout === 'boolean') {
      const wasComplete = record.tasks.workout;
      record.tasks.workout = {
        activeMinutes: wasComplete,
        steps: false,
        caloriesBurned: false
      };
      saveState();
    }
    if (record && record.tasks && record.tasks.freePasses === undefined) {
      record.tasks.freePasses = {
        workout: false,
        photo: false,
        water: false,
        bible: false,
        sleep: false
      };
      saveState();
    }
    return record;
  }

  // 5. getDayNumber(dateString)
  function getDayNumber(dateString) {
    if (!window.App.state.programStart) return 0;
    
    const partsStart = window.App.state.programStart.split('-');
    const start = new Date(partsStart[0], partsStart[1] - 1, partsStart[2]);
    
    const partsTarget = dateString.split('-');
    const target = new Date(partsTarget[0], partsTarget[1] - 1, partsTarget[2]);
    
    const diffTime = target - start;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const dayNum = diffDays + 1;
    const maxDays = window.App.state.programLengthDays || 30;
    return Math.min(dayNum, maxDays);
  }

  // 7. toggleTask(taskPath, value, dateKey)
  function toggleTask(taskPath, value, dateKey = window.App.activeDateKey || getTodayKey()) {
    const record = getTodayRecord(dateKey);
    if (!record) return;

    // Guard: ignore toggles on standard tasks if their Free Pass is active today
    const parts = taskPath.split('.');
    const isStandardTask = parts[0] === 'tasks' && parts[1] !== 'freePasses' && parts[1] !== 'diet';
    if (isStandardTask) {
      const taskKey = parts[1]; // e.g. 'workout', 'photo', 'water', 'bible', 'sleep'
      if (record.tasks && record.tasks.freePasses && record.tasks.freePasses[taskKey]) {
        return;
      }
    }
    let current = record;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) {
        console.error(`Invalid task path: ${taskPath}`);
        return;
      }
      current = current[parts[i]];
    }
    
    const lastPart = parts[parts.length - 1];
    if (current[lastPart] === undefined) {
      console.error(`Invalid task path: ${taskPath}`);
      return;
    }

    if (value !== undefined) {
      current[lastPart] = value;
    } else {
      current[lastPart] = !current[lastPart];
    }
    
    record.completed = isDayComplete(record);
    saveState();
    recalculateStreak();

    // Trigger celebration if newly completed
    if (record.completed && !record.celebrationFired) {
      triggerCelebration(record);
    }
  }

  function triggerCelebration(record) {
    if (window.confetti) {
      confetti({
        particleCount: 120,
        spread: 80,
        colors: ['#f97316', '#fbbf24', '#22c55e', '#ffffff'],
        origin: { y: 0.6 }
      });
      record.celebrationFired = true;
      saveState();
    }
  }

  // 8. isDayComplete(dayRecord)
  function isDayComplete(dayRecord) {
    if (!dayRecord || !dayRecord.tasks) return false;
    const t = dayRecord.tasks;
    const fp = t.freePasses || {};
    
    // Helper: check workout completion (handles old boolean + new object format)
    const workoutVal = t.workout;
    const workoutDone = fp.workout || (typeof workoutVal === 'boolean' ? workoutVal : (workoutVal.activeMinutes || workoutVal.steps || workoutVal.caloriesBurned));
    const photoDone = fp.photo || t.photo;
    
    const dietDone = t.diet.cheatDay || t.diet.slowCarbCompliant;
                     
    const waterDone = fp.water || t.water;
    const bibleDone = fp.bible || t.bible;
    const sleepDone = fp.sleep || (t.sleep.bedtimeHit && t.sleep.wakeHit);

    return !!(workoutDone && photoDone && dietDone && waterDone && bibleDone && sleepDone);
  }

  // 9. recalculateStreak()
  function recalculateStreak() {
    let currentStreak = 0;
    let longestStreak = window.App.state.streak.longest || 0;
    let lastCompleted = null;
    
    const today = getTodayKey();
    let dateObj = new Date();
    let checkingKey = today;
    
    // Check if today is complete, else start counting backwards from yesterday
    if (window.App.state.days[checkingKey] && isDayComplete(window.App.state.days[checkingKey])) {
      lastCompleted = checkingKey;
    } else {
      dateObj.setDate(dateObj.getDate() - 1);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      checkingKey = `${year}-${month}-${day}`;
    }

    while (true) {
      const record = window.App.state.days[checkingKey];
      if (record && (isDayComplete(record) || record.flexDayApplied === true || record.mulliganApplied === true)) {
        currentStreak++;
        if (!lastCompleted) lastCompleted = checkingKey;
      } else {
        break; // Streak broken
      }
      
      dateObj.setDate(dateObj.getDate() - 1);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      checkingKey = `${year}-${month}-${day}`;
    }
    
    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }
    
    window.App.state.streak = {
      current: currentStreak,
      longest: longestStreak,
      lastCompletedDate: lastCompleted
    };
    
    saveState();
  }

  // 10. advancePhase()
  function advancePhase() {
    const today = getTodayKey();
    if (window.App.state.currentPhase === 'phase1') {
      window.App.state.currentPhase = 'phase2';
      window.App.state.phase2Start = today;
    } else if (window.App.state.currentPhase === 'setup') {
      window.App.state.currentPhase = 'phase1';
      window.App.state.programStart = today;
      window.App.state.phase1Start = today;
    }
    saveState();
  }

  // 11. isCheatDayAvailable(weekStart)
  function isCheatDayAvailable(targetDateKey) {
    const parts = targetDateKey.split('-');
    const target = new Date(parts[0], parts[1] - 1, parts[2]);
    
    // Check previous 6 days (rolling 7-day window)
    for (let i = 1; i <= 6; i++) {
      const d = new Date(target);
      d.setDate(d.getDate() - i);
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;
      
      const record = window.App.state.days[key];
      if (record && record.tasks && record.tasks.diet && record.tasks.diet.cheatDay) {
        return false;
      }
    }
    return true;
  }

  function setLocationMode(mode) {
    window.App.state.locationMode = mode;
    saveState();
  }

  function getFlexDaysRemaining() {
    const max = window.App.state.flexDaysMax || 0;
    const used = window.App.state.flexDaysUsed || 0;
    return max - used;
  }

  function useFlexDay(dateKey) {
    if (getFlexDaysRemaining() > 0) {
      window.App.state.flexDaysUsed = (window.App.state.flexDaysUsed || 0) + 1;
      const record = getTodayRecord(dateKey);
      if (record) {
        record.flexDayApplied = true;
      }
      saveState();
      return true;
    }
    return false;
  }

  // 12. getPhase1FrictionSummary()
  function getPhase1FrictionSummary() {
    const counts = {
      workout: 0,
      photo: 0,
      'diet.weighed': 0,
      'diet.tracked': 0,
      'diet.proteinMet': 0,
      'diet.caloriesOk': 0,
      water: 0,
      bible: 0,
      'sleep.bedtimeHit': 0,
      'sleep.wakeHit': 0
    };

    window.App.state.phase1MissedDays.forEach(dateKey => {
      const record = window.App.state.days[dateKey];
      if (record && record.tasks) {
        const t = record.tasks;
        const wk = t.workout;
        if (typeof wk === 'boolean' ? !wk : !(wk.activeMinutes || wk.steps || wk.caloriesBurned)) counts.workout++;
        if (!t.photo) counts.photo++;
        if (!t.diet.cheatDay) {
          if (!t.diet.weighed) counts['diet.weighed']++;
          if (!t.diet.tracked) counts['diet.tracked']++;
          if (!t.diet.proteinMet) counts['diet.proteinMet']++;
          if (!t.diet.caloriesOk) counts['diet.caloriesOk']++;
        }
        if (!t.water) counts.water++;
        if (!t.bible) counts.bible++;
        if (!t.sleep.bedtimeHit) counts['sleep.bedtimeHit']++;
        if (!t.sleep.wakeHit) counts['sleep.wakeHit']++;
      }
    });

    return Object.entries(counts)
      .filter(([key, val]) => val > 0)
      .map(([key, val]) => ({ task: key, count: val }))
      .sort((a, b) => b.count - a.count);
  }

  // 13. exportData()
  function exportData() {
    return JSON.stringify(window.App.state, null, 2);
  }

  // 14. importData(jsonString)
  function importData(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      if (imported.version) {
        window.App.state = imported;
        saveState();
        return true;
      }
    } catch (e) {
      console.error('Failed to import data', e);
    }
    return false;
  }

  // Get number of Free Passes used for a specific task in Phase 2
  function getTaskFreePassesUsedCount(taskKey) {
    let count = 0;
    if (!window.App || !window.App.state || !window.App.state.days) return 0;
    Object.keys(window.App.state.days).forEach(key => {
      const record = window.App.state.days[key];
      if (record && record.phase === 'phase2' && record.tasks && record.tasks.freePasses && record.tasks.freePasses[taskKey]) {
        count++;
      }
    });
    return count;
  }

  // Expose to global window
  window.App = {
    state: null,
    initState,
    saveState,
    getTodayKey,
    getTodayRecord,
    getDayNumber,
    toggleTask,
    isDayComplete,
    recalculateStreak,
    advancePhase,
    isCheatDayAvailable,
    getPhase1FrictionSummary,
    exportData,
    importData,
    getTaskFreePassesUsedCount,
    setLocationMode,
    getFlexDaysRemaining,
    useFlexDay
  };

  // 15. renderTodayView(container)
  window.App.renderTodayView = function(container) {
    const App = window.App;
    const state = App.state;
    const todayKey = window.App.activeDateKey || App.getTodayKey();
    const dayRecord = App.getTodayRecord(todayKey);
    const dayNum = App.getDayNumber(todayKey);
    const isComplete = App.isDayComplete(dayRecord);
    const streak = state.streak.current;
    const isPhase1 = state.currentPhase === 'phase1';
    const cheatAvailable = App.isCheatDayAvailable(todayKey);
    const t = dayRecord.tasks;

    const isActualToday = todayKey === App.getTodayKey();
    const editingDateObj = new Date(todayKey + 'T00:00:00');
    const editingDateStr = editingDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const dayOfWeek = editingDateObj.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const sleepBedtime = isWeekend ? "11:30 PM" : "11:00 PM";
    const sleepBedtimeGrace = isWeekend ? "11:45 PM" : "11:15 PM";
    const sleepWake = isWeekend ? "7:00 AM" : "6:30 AM";
    const sleepWakeGrace = isWeekend ? "7:15 AM" : "6:45 AM";

    const pGoal = state.settings.proteinGoal || 175;
    const cCeil = state.settings.calorieCeiling || 2700;
    const pGrace = Math.round(pGoal * 0.8);
    const cGrace = Math.round(cCeil * 1.1);

    // Helper: generate standard checkbox visual
    const renderCheckbox = (isChecked) => `
      <div class="checkbox-task__visual" style="${isChecked ? 'border-style: solid; background: var(--color-primary); border-color: var(--color-primary); box-shadow: var(--shadow-glow);' : ''}">
        <svg class="checkbox-task__icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="${isChecked ? 'opacity: 1; transform: scale(1);' : ''}">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
    `;

    // Free Passes setup
    const fp = t.freePasses || {};

    // Task completions accounting for Free Passes
    const workoutDone = fp.workout || t.workout.activeMinutes || t.workout.steps || t.workout.caloriesBurned;
    const photoDone = fp.photo || t.photo;
    const waterDone = fp.water || t.water;
    const bibleDone = fp.bible || t.bible;
    const sleepDone = fp.sleep || (t.sleep.bedtimeHit && t.sleep.wakeHit);

    // Diet Expandable logic
    const dietChecked = t.diet.cheatDay || t.diet.slowCarbCompliant;

    // Helper: generate standard Free Pass footer row inside task cards
    const renderFreePassRow = (taskKey) => {
      // Only render Free Passes in Phase 2
      if (state.currentPhase !== 'phase2' && dayRecord.phase !== 'phase2') return '';

      const isPassActive = fp[taskKey];
      const usedCount = App.getTaskFreePassesUsedCount(taskKey);

      return `
        <div class="free-pass-row" style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; font-size: var(--text-xs); transition: all var(--duration-fast);">
          <div style="display: flex; align-items: center; gap: var(--space-2); color: ${isPassActive ? 'var(--color-gold)' : 'var(--color-text-muted)'}; font-weight: 600;">
            🎟️ ${isPassActive ? '<span style="color: var(--color-gold); font-weight: 800; text-shadow: 0 0 8px oklch(from var(--color-gold) l c h / 0.3);">FREE PASS ACTIVE</span>' : `Free Passes: ${usedCount}/2 Used`}
          </div>
          ${isPassActive ? `
            <button class="btn-ghost" style="min-height: 24px; padding: 2px var(--space-3); font-size: 10px; border-color: var(--color-gold); color: var(--color-gold); font-weight: 700; border-radius: var(--radius-sm);" data-action="toggle" data-path="tasks.freePasses.${taskKey}">
              Revoke Pass
            </button>
          ` : (usedCount < 2 ? `
            <button class="btn-ghost" style="min-height: 24px; padding: 2px var(--space-3); font-size: 10px; border-color: var(--color-gold); color: var(--color-gold); font-weight: 700; border-radius: var(--radius-sm);" data-action="toggle" data-path="tasks.freePasses.${taskKey}">
              Use Free Pass
            </button>
          ` : `
            <span style="color: var(--color-text-faint); font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;">2/2 Used</span>
          `)}
        </div>
      `;
    };

    let html = `
      ${!isActualToday ? `
        <div style="background: oklch(from var(--color-gold) l c h / 0.15); border: 1px solid var(--color-gold); color: var(--color-gold); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4); display: flex; align-items: center; justify-content: space-between;" class="fade-in-up">
          <div style="font-weight: 700; font-size: var(--text-sm);">📝 Editing: ${editingDateStr} (Day ${dayNum})</div>
          <button id="btn-back-to-today" class="btn-ghost" style="padding: var(--space-1) var(--space-3); font-size: var(--text-xs); border-color: var(--color-gold); color: var(--color-gold);">← Back to Today</button>
        </div>
      ` : ''}

      ${isComplete ? `
        <div style="background: var(--color-success); color: #fff; text-align: center; padding: var(--space-2); font-weight: 800; letter-spacing: 0.1em; border-radius: var(--radius-md); margin-bottom: var(--space-4);" class="fade-in-up">
          🔥 DAY COMPLETE
        </div>
      ` : ''}

      <header class="header fade-in-up">
        <div class="header__brand">
          <span class="icon-flame icon-flame--lg icon-flame-hero" style="${isComplete ? 'filter: hue-rotate(80deg) drop-shadow(0 0 12px #22c55e);' : ''}"></span>
          <h1 class="header__title" style="font-family: var(--font-display); letter-spacing: 0.06em; background: ${isComplete ? 'linear-gradient(135deg, #4ade80, #22c55e)' : 'linear-gradient(135deg, #fdba74, var(--color-primary))'}; -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            DAY ${dayNum} / ${state.programLengthDays || 30}
          </h1>
        </div>
      </header>

      <div class="streak-counter fade-in-up" style="margin-bottom: var(--space-8);">
        <div class="streak-counter__number" style="--streak-display: ${streak}; ${isComplete ? 'color: var(--color-success);' : ''}"></div>
        <div class="streak-counter__label">DAY STREAK</div>
      </div>

      ${isPhase1 ? `
        <div style="background: oklch(from var(--color-gold) l c h / 0.15); border: 1px solid var(--color-gold); color: var(--color-gold); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); font-weight: 600; margin-bottom: var(--space-6);" class="fade-in-up">
          Phase 1 &mdash; Calibration Mode. Misses are logged, not restarted.
        </div>
      ` : ''}

      <section class="section">
        <h2 class="section__title fade-in-up">Today's Tasks</h2>
        
        <!-- Task 1: Workout -->
        <div class="card fade-in-up" style="margin-bottom: var(--space-3); border-color: ${fp.workout ? 'var(--color-gold)' : (workoutDone ? 'var(--color-success)' : 'var(--color-border)')};">
          <div style="display: flex; align-items: center; gap: var(--space-4); cursor: pointer;" onclick="document.getElementById('workout-details').style.display = document.getElementById('workout-details').style.display === 'none' ? 'block' : 'none'">
            <div class="checkbox-task">
              ${renderCheckbox(workoutDone)}
            </div>
            <div style="flex: 1;">
              <div style="font-weight: 700; color: ${workoutDone ? 'var(--color-text-muted)' : 'var(--color-text)'};">90-Minute Workout</div>
              <div style="font-size: var(--text-sm); color: var(--color-text-faint);">Active Minutes, Steps, or Calories Burned</div>
            </div>
            ${fp.workout ? '<span class="badge" style="background: var(--color-gold); color: #000;">🎟️ FREE PASS</span>' : (workoutDone ? '<span class="badge badge-success">✓ DONE</span>' : '<span style="font-size: 1.2rem;">▼</span>')}
          </div>
          
          <div id="workout-details" style="display: none; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
            <div style="font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: var(--space-3);">
              CHECK ANY ONE TO COMPLETE
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              <label style="display: flex; align-items: center; gap: var(--space-3); opacity: ${fp.workout ? '0.5' : '1'};">
                <input type="checkbox" style="width: 20px; height: 20px; accent-color: var(--color-primary);" ${t.workout.activeMinutes ? 'checked' : ''} ${fp.workout ? 'disabled' : ''} data-action="toggle" data-path="tasks.workout.activeMinutes"> 90 Active Minutes
              </label>
              <label style="display: flex; align-items: center; gap: var(--space-3); opacity: ${fp.workout ? '0.5' : '1'};">
                <input type="checkbox" style="width: 20px; height: 20px; accent-color: var(--color-primary);" ${t.workout.steps ? 'checked' : ''} ${fp.workout ? 'disabled' : ''} data-action="toggle" data-path="tasks.workout.steps"> 10,000 Steps
              </label>
              <label style="display: flex; align-items: center; gap: var(--space-3); opacity: ${fp.workout ? '0.5' : '1'};">
                <input type="checkbox" style="width: 20px; height: 20px; accent-color: var(--color-primary);" ${t.workout.caloriesBurned ? 'checked' : ''} ${fp.workout ? 'disabled' : ''} data-action="toggle" data-path="tasks.workout.caloriesBurned"> 1,000 Calories Burned
              </label>
            </div>
          </div>
          ${renderFreePassRow('workout')}
        </div>
 
        <!-- Task 2: Photo -->
        <div class="card fade-in-up" style="margin-bottom: var(--space-3); border-color: ${fp.photo ? 'var(--color-gold)' : (photoDone ? 'var(--color-success)' : 'var(--color-border)')};" data-action="toggle" data-path="tasks.photo">
          <div style="display: flex; align-items: center; gap: var(--space-4); opacity: ${fp.photo ? '0.6' : '1'}; cursor: ${fp.photo ? 'default' : 'pointer'};">
            <div class="checkbox-task">
              ${renderCheckbox(photoDone)}
            </div>
            <div style="flex: 1;">
              <div style="font-weight: 700; color: ${photoDone ? 'var(--color-text-muted)' : 'var(--color-text)'};">Progress Photo</div>
              <div style="font-size: var(--text-sm); color: var(--color-text-faint);">Daily photo &mdash; front, side, or back</div>
            </div>
            ${fp.photo ? '<span class="badge" style="background: var(--color-gold); color: #000;">🎟️ FREE PASS</span>' : (photoDone ? '<span class="badge badge-success">✓ DONE</span>' : '')}
          </div>
          ${renderFreePassRow('photo')}
        </div>

        <!-- Task 3: Diet -->
        <div class="card fade-in-up" style="margin-bottom: var(--space-3); border-color: ${dietChecked ? 'var(--color-success)' : 'var(--color-border)'};">
          <div style="display: flex; align-items: center; gap: var(--space-4); cursor: pointer;" onclick="document.getElementById('diet-details').style.display = document.getElementById('diet-details').style.display === 'none' ? 'block' : 'none'">
            <div class="checkbox-task" ${t.diet.cheatDay ? '' : 'data-action="toggle" data-path="tasks.diet.slowCarbCompliant"'}>
              ${renderCheckbox(dietChecked)}
            </div>
            <div style="flex: 1;">
              <div style="font-weight: 700; color: ${dietChecked ? 'var(--color-text-muted)' : 'var(--color-text)'};">Diet & Nutrition</div>
              <div style="font-size: var(--text-sm); color: var(--color-text-faint);">
                ${t.diet.cheatDay ? 'Cheat day used today' : (t.diet.slowCarbCompliant ? 'Slow-Carb compliant' : 'Pending')}
              </div>
            </div>
            ${t.diet.cheatDay ? '<span class="badge" style="background: var(--color-gold); color: #000;">CHEAT DAY</span>' : (dietChecked ? '<span class="badge badge-success">✓ DONE</span>' : '<span style="font-size: 1.2rem;">▼</span>')}
          </div>
          
          <div id="diet-details" style="display: none; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              <label style="display: flex; align-items: center; gap: var(--space-3); opacity: ${t.diet.cheatDay ? '0.5' : '1'};">
                <input type="checkbox" style="width: 20px; height: 20px; accent-color: var(--color-primary);" ${t.diet.slowCarbCompliant ? 'checked' : ''} ${t.diet.cheatDay ? 'disabled' : ''} data-action="toggle" data-path="tasks.diet.slowCarbCompliant"> Stuck to Slow-Carb rules today
              </label>

              ${t.diet.cheatDay && !dayRecord.weight ? `
                <div style="display: flex; flex-direction: column; gap: var(--space-1); margin-top: var(--space-2);">
                  <label for="input-weight" style="font-size: var(--text-xs); color: var(--color-gold); font-weight: 600;">Log weight before your cheat day begins</label>
                  <input type="number" id="input-weight" placeholder="Morning Weigh-In" value="" style="width: 100%; padding: var(--space-2); background: var(--color-surface); border: 1px solid var(--color-gold); color: #fff; border-radius: var(--radius-md); font-size: 16px;">
                </div>
              ` : `
                <div style="display: flex; flex-direction: column; gap: var(--space-1); margin-top: var(--space-2);">
                  <input type="number" id="input-weight" placeholder="Weight" value="${dayRecord.weight || ''}" style="width: 100%; padding: var(--space-2); background: var(--color-surface); border: 1px solid var(--color-border); color: #fff; border-radius: var(--radius-md); font-size: 16px;">
                </div>
              `}

              ${cheatAvailable || t.diet.cheatDay ? `
                <button class="btn-ghost" style="margin-top: var(--space-3); width: 100%; border-color: var(--color-gold); color: var(--color-gold);" data-action="toggle" data-path="tasks.diet.cheatDay">
                  🍔 ${t.diet.cheatDay ? 'Undo Cheat Day' : 'Use Cheat Day'}
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Task 4: Water -->
        <div class="card fade-in-up" style="margin-bottom: var(--space-3); border-color: ${fp.water ? 'var(--color-gold)' : (waterDone ? 'var(--color-success)' : 'var(--color-border)')};" role="checkbox" aria-checked="${waterDone}" aria-label="Water 120 oz">
          <div style="display: flex; align-items: center; gap: var(--space-4); opacity: ${fp.water ? '0.6' : '1'}; cursor: ${fp.water ? 'default' : 'pointer'};">
            <div class="checkbox-task ${waterDone ? 'pop' : ''}" ${fp.water ? '' : 'data-action="toggle" data-path="tasks.water"'}>
              ${renderCheckbox(waterDone)}
            </div>
            <div style="flex: 1;">
              <div style="font-weight: 700; color: ${waterDone ? 'var(--color-text-muted)' : 'var(--color-text)'};">Water &mdash; 120 oz</div>
              <div style="font-size: var(--text-sm); color: var(--color-text-faint);">3 × 40 oz bottles (Stanley or Hydroflask)</div>
            </div>
            ${fp.water ? '<span class="badge" style="background: var(--color-gold); color: #000;">🎟️ FREE PASS</span>' : (waterDone ? '<span class="badge badge-success">✓ DONE</span>' : '')}
          </div>
          <div style="display: flex; gap: var(--space-6); margin-top: var(--space-4); margin-left: 44px; opacity: ${fp.water ? '0.5' : '1'}; pointer-events: ${fp.water ? 'none' : 'auto'};">
            ${[1, 2, 3].map(i => `
              <div class="water-bottle ${dayRecord.waterBottles >= i ? 'water-bottle--filled' : ''}" 
                   data-index="${i}" 
                   role="button" 
                   aria-label="Bottle ${i} of 3 &mdash; ${dayRecord.waterBottles >= i ? 'filled' : 'tap to fill'}" 
                   aria-pressed="${dayRecord.waterBottles >= i}">
              </div>
            `).join('')}
          </div>
          ${renderFreePassRow('water')}
        </div>
 
        <!-- Task 5: Bible -->
        <div class="card fade-in-up" style="margin-bottom: var(--space-3); border-color: ${fp.bible ? 'var(--color-gold)' : (bibleDone ? 'var(--color-success)' : 'var(--color-border)')};" data-action="toggle" data-path="tasks.bible">
          <div style="display: flex; align-items: center; gap: var(--space-4); opacity: ${fp.bible ? '0.6' : '1'}; cursor: ${fp.bible ? 'default' : 'pointer'};">
            <div class="checkbox-task">
              ${renderCheckbox(bibleDone)}
            </div>
            <div style="flex: 1;">
              <div style="font-weight: 700; color: ${bibleDone ? 'var(--color-text-muted)' : 'var(--color-text)'};">Bible Reading & Prayer</div>
              <div style="font-size: var(--text-sm); color: var(--color-text-faint);">5 minutes &mdash; scripture + prayer</div>
            </div>
            ${fp.bible ? '<span class="badge" style="background: var(--color-gold); color: #000;">🎟️ FREE PASS</span>' : (bibleDone ? '<span class="badge badge-success">✓ DONE</span>' : '')}
          </div>
          ${renderFreePassRow('bible')}
        </div>
 
        <!-- Task 6: Sleep -->
        <div class="card fade-in-up" style="margin-bottom: var(--space-3); border-color: ${fp.sleep ? 'var(--color-gold)' : (sleepDone ? 'var(--color-success)' : 'var(--color-border)')};">
          <div style="display: flex; align-items: center; gap: var(--space-4); cursor: pointer;" onclick="document.getElementById('sleep-details').style.display = document.getElementById('sleep-details').style.display === 'none' ? 'block' : 'none'">
            <div class="checkbox-task">
              ${renderCheckbox(sleepDone)}
            </div>
            <div style="flex: 1;">
              <div style="font-weight: 700; color: ${sleepDone ? 'var(--color-text-muted)' : 'var(--color-text)'};">Sleep Window</div>
              <div style="font-size: var(--text-sm); color: var(--color-text-faint);">In bed night before by ${sleepBedtime} &middot; Up day of by ${sleepWake}</div>
            </div>
            ${fp.sleep ? '<span class="badge" style="background: var(--color-gold); color: #000;">🎟️ FREE PASS</span>' : (sleepDone ? '<span class="badge badge-success">✓ DONE</span>' : '<span style="font-size: 1.2rem;">▼</span>')}
          </div>
          
          <div id="sleep-details" style="display: none; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
            <div style="font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: var(--space-3);">
              GRACE WINDOW: ±15 min
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              <label style="display: flex; align-items: center; gap: var(--space-3); opacity: ${fp.sleep ? '0.5' : '1'};">
                <input type="checkbox" style="width: 20px; height: 20px; accent-color: var(--color-primary);" ${t.sleep.bedtimeHit ? 'checked' : ''} ${fp.sleep ? 'disabled' : ''} data-action="toggle" data-path="tasks.sleep.bedtimeHit"> In bed the night before by ${sleepBedtime} (+15m = ${sleepBedtimeGrace})
              </label>
              <label style="display: flex; align-items: center; gap: var(--space-3); opacity: ${fp.sleep ? '0.5' : '1'};">
                <input type="checkbox" style="width: 20px; height: 20px; accent-color: var(--color-primary);" ${t.sleep.wakeHit ? 'checked' : ''} ${fp.sleep ? 'disabled' : ''} data-action="toggle" data-path="tasks.sleep.wakeHit"> Up the day of by ${sleepWake} (+15m = ${sleepWakeGrace})
              </label>
            </div>
          </div>
          ${renderFreePassRow('sleep')}
        </div>

      </section>

      ${isPhase1 ? `
        <section class="section fade-in-up">
          <button id="btn-add-friction" class="btn-ghost" style="width: 100%; margin-bottom: var(--space-3);">📝 Add Friction Note</button>
          <textarea id="friction-note" placeholder="What was hard today? What needs to change for Phase 2?" style="display: none; width: 100%; min-height: 100px; padding: var(--space-3); background: var(--color-surface); border: 1px solid var(--color-border); color: #fff; border-radius: var(--radius-md); font-family: var(--font-body); resize: vertical;">${dayRecord.notes || ''}</textarea>
        </section>
      ` : ''}

      <div class="toast" id="toast"></div>
    `;

    container.innerHTML = html;

    // --- Events ---

    // Back to today button (mulligan editing mode)
    const btnBack = container.querySelector('#btn-back-to-today');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        window.App.activeDateKey = null;
        App.renderTodayView(container);
      });
    }

    // Toggle tasks
    container.querySelectorAll('[data-action="toggle"]').forEach(el => {
      el.addEventListener('click', (e) => {
        // Prevent click propagating if it's an input inside a label, so it doesn't double fire
        if (el.tagName !== 'INPUT' && e.target.tagName === 'INPUT') return;
        
        e.stopPropagation();
        App.toggleTask(el.dataset.path);
        
        // Add pop animation
        const checkbox = el.querySelector('.checkbox-task') || el.closest('.checkbox-task');
        if (checkbox) {
          checkbox.classList.add('pop');
          setTimeout(() => checkbox.classList.remove('pop'), 400);
        }
        
        render(); 
      });
      if (el.tagName !== 'INPUT') {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            App.toggleTask(el.dataset.path);
            render();
            checkCompletionAnimation();
          }
        });
      }
    });

    // Diet numeric inputs
    ['weight'].forEach(field => {
      const input = container.querySelector(`#input-${field}`);
      if (input) {
        input.addEventListener('change', (e) => {
          const val = parseFloat(e.target.value);
          if (field === 'weight') dayRecord.weight = val;
          App.saveState();
        });
      }
    });

    // Water bottle clicks
    container.querySelectorAll('.water-bottle').forEach(el => {
      el.addEventListener('click', () => {
        // Guard: ignore clicks if Free Pass is active today
        if (dayRecord.tasks && dayRecord.tasks.freePasses && dayRecord.tasks.freePasses.water) return;

        const index = parseInt(el.dataset.index);
        dayRecord.waterBottles = index;
        if (index === 3) {
          App.toggleTask('tasks.water', true);
        } else {
          App.toggleTask('tasks.water', false);
        }
        render();
        checkCompletionAnimation();
      });
    });

    // Friction notes
    const btnFriction = container.querySelector('#btn-add-friction');
    const noteArea = container.querySelector('#friction-note');
    if (btnFriction && noteArea) {
      if (dayRecord.notes) {
        noteArea.style.display = 'block';
        btnFriction.style.display = 'none';
      }
      btnFriction.addEventListener('click', () => {
        noteArea.style.display = 'block';
        btnFriction.style.display = 'none';
        noteArea.focus();
      });
      noteArea.addEventListener('blur', (e) => {
        dayRecord.notes = e.target.value;
        if (dayRecord.notes) {
          // ensure we track this missed day in friction log array
          if (!state.phase1MissedDays.includes(todayKey)) {
            state.phase1MissedDays.push(todayKey);
          }
        }
        App.saveState();
      });
    }

    // Confetti logic moved to triggerCelebration() in data layer
    function checkCompletionAnimation() {
      // Logic handled via App.toggleTask -> triggerCelebration
    }

    function render() {
      // Preserve which expandable panels are open
      const workoutOpen = container.querySelector('#workout-details');
      const dietOpen = container.querySelector('#diet-details');
      const sleepOpen = container.querySelector('#sleep-details');
      const wasWorkoutOpen = workoutOpen && workoutOpen.style.display !== 'none';
      const wasDietOpen = dietOpen && dietOpen.style.display !== 'none';
      const wasSleepOpen = sleepOpen && sleepOpen.style.display !== 'none';
      
      App.renderTodayView(container);
      
      // Restore panel states
      if (wasWorkoutOpen) {
        const wd = container.querySelector('#workout-details');
        if (wd) wd.style.display = 'block';
      }
      if (wasDietOpen) {
        const dd = container.querySelector('#diet-details');
        if (dd) dd.style.display = 'block';
      }
      if (wasSleepOpen) {
        const sd = container.querySelector('#sleep-details');
        if (sd) sd.style.display = 'block';
      }
    }
  };

  // 16. renderProgressView(container)
  window.App.renderProgressView = function(container) {
    const App = window.App;
    const state = App.state;
    const todayKey = App.getTodayKey();
    const currentDayNum = App.getDayNumber(todayKey);
    
    // Calculate completions
    let totalCompleted = 0;
    let weightData = [];
    let travelDaysLogged = 0;
    let travelDaysMet = 0;
    
    Object.keys(state.days).sort().forEach(key => {
      const record = state.days[key];
      if (record.completed) {
        totalCompleted++;
      }
      if (record.weight) {
        weightData.push({ day: record.dayNumber, weight: record.weight });
      }
      if (record.locationMode === 'travel') {
        travelDaysLogged++;
        if (record.completed) {
          travelDaysMet++;
        }
      }
    });
    
    const adaptabilityScore = travelDaysLogged > 0 ? Math.round((travelDaysMet / travelDaysLogged) * 100) : 100;
    const frictionSummary = App.getPhase1FrictionSummary();
    
    let calendarCells = '';
    const startStr = state.programStart || todayKey;
    const parts = startStr.split('-');
    const startDate = new Date(parts[0], parts[1] - 1, parts[2]);
    
    const maxDays = state.programLengthDays || 30;
    for (let i = 1; i <= maxDays; i++) {
      let d = new Date(startDate);
      d.setDate(d.getDate() + i - 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const expectedKey = `${year}-${month}-${day}`;
      
      let record = null;
      let statusClass = 'future';
      let label = '';
      
      if (state.programStart && expectedKey <= todayKey) {
        record = state.days[expectedKey];
        if (expectedKey === todayKey) {
          statusClass = 'today';
        } else if (record && record.completed) {
          statusClass = 'completed';
          if (record.tasks && record.tasks.freePasses) {
            const hasFP = Object.values(record.tasks.freePasses).some(val => val === true);
            if (hasFP) {
              label = 'F';
            }
          }
        } else {
          statusClass = 'missed';
          label = 'M';
        }
      }
      
      let tooltip = `Day ${i} (Future)`;
      if (record) {
        let statusText = record.completed ? 'Completed' : 'Missed/Incomplete';
        if (record.tasks && record.tasks.freePasses) {
          const activePasses = [];
          Object.keys(record.tasks.freePasses).forEach(taskKey => {
            if (record.tasks.freePasses[taskKey]) {
              activePasses.push(taskKey.charAt(0).toUpperCase() + taskKey.slice(1));
            }
          });
          if (activePasses.length > 0) {
            statusText += ` (Free Pass: ${activePasses.join(', ')})`;
          }
        }
        tooltip = `Day ${i}: ${statusText}${record.notes ? `\n"${record.notes}"` : ''}`;
      }
      
      calendarCells += `
        <div class="calendar-cell calendar-cell--${statusClass}" title="${tooltip}" style="${label === 'F' ? 'border: 1px solid var(--color-gold); color: var(--color-gold); font-weight: 800;' : ''}">
          ${label}
        </div>
      `;
    }
    
    let sparklineHTML = '<div style="color: var(--color-text-faint); font-size: var(--text-sm); text-align: center; padding: var(--space-4);">Log your weight daily to see your trend</div>';
    if (weightData.length >= 3) {
      weightData.sort((a,b) => a.day - b.day);
      const minW = Math.min(...weightData.map(d => d.weight));
      const maxW = Math.max(...weightData.map(d => d.weight));
      const diff = maxW - minW || 1;
      
      const width = 100;
      const height = 40;
      const firstDay = weightData[0].day;
      const lastDay = weightData[weightData.length-1].day;
      const daySpan = lastDay - firstDay || 1;
      
      const points = weightData.map(d => {
        const x = ((d.day - firstDay) / daySpan) * width;
        const y = height - (((d.weight - minW) / diff) * height);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      
      const startW = weightData[0].weight;
      const currentW = weightData[weightData.length-1].weight;
      const deltaW = (currentW - startW).toFixed(1);
      
      sparklineHTML = `
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-2);">
          <div style="font-size: var(--text-sm); color: var(--color-text-muted);">Start: <b style="color:var(--color-text);">${startW}</b></div>
          <div style="font-family: var(--font-display); font-size: var(--text-xl); color: ${deltaW <= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${deltaW > 0 ? '+' : ''}${deltaW} lbs</div>
          <div style="font-size: var(--text-sm); color: var(--color-text-muted);">Current: <b style="color:var(--color-text);">${currentW}</b></div>
        </div>
        <svg viewBox="-4 -4 108 48" style="width: 100%; height: 80px; overflow: visible;">
          <polyline points="${points}" fill="none" stroke="var(--color-primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="0" cy="${height - (((startW - minW)/diff)*height)}" r="4" fill="var(--color-surface)" stroke="var(--color-primary)" stroke-width="2" />
          <circle cx="100" cy="${height - (((currentW - minW)/diff)*height)}" r="4" fill="var(--color-primary)" />
        </svg>
      `;
    }
    
    const progressPercent = Math.min((totalCompleted / maxDays) * 100, 100);
    const displayDay = state.programStart ? Math.min(Math.max(currentDayNum, 1), maxDays) : 0;
 
    let html = `
      <style>
        .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: var(--space-2); margin-top: var(--space-4); }
        .calendar-cell { aspect-ratio: 1; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; cursor: pointer; transition: transform 0.2s; }
        .calendar-cell:active { transform: scale(0.9); }
        .calendar-cell--future { background: var(--color-surface-offset); }
        .calendar-cell--completed { background: var(--color-success); color: #fff; box-shadow: 0 0 8px var(--color-success-dim); }
        .calendar-cell--missed { background: oklch(from var(--color-primary) l c h / 0.15); color: var(--color-primary); border: 1.5px dashed var(--color-primary); }
        .calendar-cell--today { border: 2px solid var(--color-primary); box-shadow: 0 0 10px var(--color-primary-dim); animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 oklch(from var(--color-primary) l c h / 0.4); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
      </style>
 
      <header class="header fade-in-up">
        <h1 class="header__title" style="font-family: var(--font-display); font-size: var(--text-xl); letter-spacing: 0.06em; margin-bottom: var(--space-6);">
          YOUR ${maxDays} DISCIPLINED JOURNEY
        </h1>
 
        <div style="text-align: left; margin-bottom: var(--space-6);">
          <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-2);">
            <div style="font-family: var(--font-display); font-size: var(--text-lg); letter-spacing: 0.04em;">DAY ${displayDay} OF ${maxDays}</div>
            <div style="font-weight: 700; color: var(--color-text-muted);">${Math.round(progressPercent)}%</div>
          </div>
          <div class="progress-bar-outer">
            <div class="progress-bar-inner" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
      </header>
 
      <section class="section fade-in-up stagger" style="display: flex; flex-direction: column; gap: var(--space-4);">
        <div class="card" style="text-align: center; display: flex; flex-direction: column; align-items: center; padding: var(--space-6);">
          <span class="icon-flame icon-flame--xl" style="${state.streak.current >= 7 ? 'filter: sepia(1) saturate(4) hue-rotate(5deg) drop-shadow(0 0 16px #fbbf24);' : ''}"></span>
          <div style="font-family: var(--font-display); font-size: clamp(3rem, 5vw, 4.5rem); color: ${state.streak.current >= 7 ? 'var(--color-gold)' : 'var(--color-primary)'}; line-height: 1; margin-top: var(--space-2);">
            ${state.streak.current}
          </div>
          <div style="font-weight: 800; font-size: var(--text-sm); letter-spacing: 0.15em; color: var(--color-text-faint); margin-bottom: var(--space-2);">CURRENT STREAK</div>
          
          ${state.streak.current >= 7 ? '<div class="badge" style="background: var(--color-gold); color: #000; margin-bottom: var(--space-3);">🔥 WEEK WARRIOR</div>' : ''}
          
          <div style="font-size: var(--text-sm); color: var(--color-text-muted);">
            ${state.streak.current === 0 ? 'Start your streak today.' : `LONGEST: ${state.streak.longest} days`}
          </div>
        </div>

        <div class="card" style="text-align: center; display: flex; flex-direction: column; align-items: center; padding: var(--space-6);">
          <span style="font-size: 2rem; margin-top: var(--space-2);">🧭</span>
          <div style="font-family: var(--font-display); font-size: clamp(3rem, 5vw, 4.5rem); color: var(--color-primary); line-height: 1; margin-top: var(--space-2);">
            ${adaptabilityScore}%
          </div>
          <div style="font-weight: 800; font-size: var(--text-sm); letter-spacing: 0.15em; color: var(--color-text-faint); margin-bottom: var(--space-2);">ADAPTABILITY SCORE</div>
          
          <div style="font-size: var(--text-sm); color: var(--color-text-muted);">
            Travel Days: ${travelDaysMet} / ${travelDaysLogged} completed
          </div>
        </div>
      </section>
 
      <section class="section fade-in-up stagger">
        <h2 class="section__title">CALENDAR</h2>
        <div class="card" style="padding: var(--space-5) var(--space-4);">
          <div class="calendar-grid">
            ${calendarCells}
          </div>
        </div>
      </section>
 
      ${frictionSummary.length > 0 ? `
      <section class="section fade-in-up stagger">
        <h2 class="section__title">FRICTION LOG</h2>
        <div class="card" style="padding: var(--space-4);">
          <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-bottom: var(--space-4); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Tasks missed most often in Phase 1:</div>
          <ul style="display: flex; flex-direction: column; gap: var(--space-3);">
            ${frictionSummary.map(f => {
              const icons = { workout: '💪', photo: '📸', 'diet.weighed': '⚖️', 'diet.tracked': '📱', 'diet.proteinMet': '🥩', 'diet.caloriesOk': '🍔', water: '💧', bible: '📖', 'sleep.bedtimeHit': '🛏️', 'sleep.wakeHit': '🌅' };
              const labels = { workout: 'Workout', photo: 'Photo', 'diet.weighed': 'Weigh-in', 'diet.tracked': 'Track Diet', 'diet.proteinMet': 'Protein', 'diet.caloriesOk': 'Calories', water: 'Water', bible: 'Bible', 'sleep.bedtimeHit': 'Bedtime', 'sleep.wakeHit': 'Wake time' };
              return `
              <li style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-2);">
                <span style="font-weight: 600;">${icons[f.task] || '⚠️'} ${labels[f.task] || f.task}</span>
                <span style="color: var(--color-danger); font-weight: 700;">Missed ${f.count} ${f.count === 1 ? 'time' : 'times'}</span>
              </li>`;
            }).join('')}
          </ul>
        </div>
      </section>` : ''}
 
      <section class="section fade-in-up stagger">
        <h2 class="section__title">WEIGHT TREND</h2>
        <div class="card" style="padding: var(--space-5) var(--space-4);">
          ${sparklineHTML}
        </div>
      </section>
 
      <div style="height: 60px;"></div>
    `;
 
    container.innerHTML = html;
  };

  // 17. renderRulesView ───────────────────────────────
  window.App.renderRulesView = function(container) {
    const RULES = [
      {
        n: 1, icon: '🏋️', title: '90-MINUTE WORKOUT',
        body: 'Complete any ONE of: 90 Active Minutes, 10,000 Steps, or 1,000 Calories Burned. Lifting, Peloton, walking, or any combo.'
      },
      {
        n: 2, icon: '📸', title: 'PROGRESS PHOTO',
        body: 'One photo per day. Front, side, or back. No filters. Honest documentation.'
      },
      {
        n: 3, icon: '🥩', title: 'DIET',
        body: 'Daily weigh-in. Cal AI tracking. 180g protein minimum. Stay under 2,700 calories.\nOne cheat day per week allowed — no tracking required that day.'
      },
      {
        n: 4, icon: '💧', title: 'WATER — 120 OZ',
        body: '3 full 40 oz bottles (Stanley or Hydroflask). Track each bottle.'
      },
      {
        n: 5, icon: '📖', title: 'BIBLE & PRAYER — 5 MIN',
        body: 'Five minutes of scripture and prayer. Spiritual grounding. Non-negotiable.'
      },
      {
        n: 6, icon: '😴', title: 'SLEEP WINDOW',
        body: 'In bed the night before by 11:00 PM (±15 min). Up the day of by 6:30 AM (±15 min). Both required to count.\n\nWeekends (Saturday & Sunday entries) are shifted to: Bedtime by 11:30 PM (±15 min) and Wake by 7:00 AM (±15 min).\n\nThis ensures a late night only affects a single day\'s window (the following day) rather than dragging across two consecutive days.'
      },
      {
        n: 7, icon: '🧭', title: 'LOCATION & FLEX DAYS',
        body: 'Set your Location Mode (Home, Travel, or Disrupted) to adjust targets dynamically. Use Flex Days when life causes unexpected disruptions to protect your streak.'
      }
    ];

    container.innerHTML = `
      <div id="app" style="max-width:480px;margin:0 auto;padding:0 var(--space-4) var(--space-20);">

        <!-- Section 1: Overview -->
        <header class="header fade-in-up" style="padding-top:var(--space-8);padding-bottom:var(--space-4);text-align:left;">
          <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-1);">
            <span class="icon-flame icon-flame--xl"></span>
            <h1 style="font-family:var(--font-display);font-size:var(--text-xl);letter-spacing:0.06em;
                        background:linear-gradient(135deg,#fdba74,var(--color-primary));
                        -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.1;">
              THE 30 DISCIPLINED<br>CHALLENGE
            </h1>
          </div>
          <p style="font-family:var(--font-body);font-size:var(--text-sm);color:var(--color-text-muted);margin-bottom:var(--space-6);">
            Built for discipline. Tailored for real life.
          </p>

          <div style="margin-bottom:var(--space-8);">
            <div class="card" style="padding:var(--space-4);border-top:3px solid var(--color-primary);">
              <div class="badge badge-phase2" style="margin-bottom:var(--space-2);">CHALLENGE</div>
              <div style="font-family:var(--font-display);font-size:var(--text-lg);color:var(--color-primary);line-height:1.1;margin-bottom:var(--space-2);">30-DAY CHALLENGE</div>
              <p style="font-size:var(--text-xs);color:var(--color-text-muted);line-height:1.6;">30 days of full execution. Built to build habits that compound into results. Build discipline, track progress, and adapt to your real life.</p>
            </div>
          </div>
        </header>

        <!-- Section 2: The 7 Rules -->
        <section class="section fade-in-up">
          <h2 class="section__title">THE 7 DAILY RULES</h2>
          <div style="display:flex;flex-direction:column;gap:var(--space-3);">
            ${RULES.map(r => `
              <div class="card" style="box-shadow:inset 3px 0 0 var(--color-primary),var(--shadow-md);padding:var(--space-4) var(--space-4) var(--space-4) var(--space-5);">
                <div style="display:flex;align-items:baseline;gap:var(--space-3);margin-bottom:var(--space-2);">
                  <span style="font-family:var(--font-display);font-size:var(--text-xl);color:var(--color-primary);line-height:1;min-width:1.4rem;">${r.n}</span>
                  <div>
                    <div style="font-family:var(--font-display);font-size:var(--text-base);letter-spacing:0.05em;color:var(--color-text);">
                       ${r.icon} ${r.title}
                    </div>
                  </div>
                </div>
                <p style="font-size:var(--text-sm);color:var(--color-text-muted);line-height:1.7;white-space:pre-line;padding-left:2.4rem;">${r.body}</p>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- Section 3: Program Rules -->
        <section class="section fade-in-up">
          <h2 class="section__title">CHALLENGE RULES</h2>
          <div style="display:flex;flex-direction:column;gap:var(--space-3);">
            <div class="card" style="box-shadow:inset 3px 0 0 var(--color-primary),var(--shadow-md);padding:var(--space-4) var(--space-4) var(--space-4) var(--space-5);">
              <div style="font-family:var(--font-display);font-size:var(--text-base);color:var(--color-primary);letter-spacing:0.05em;margin-bottom:var(--space-2);">
                30-DAY CHALLENGE
              </div>
              <p style="font-size:var(--text-sm);color:var(--color-text-muted);line-height:1.7;">
                Full execution. Set your start date and stay disciplined for 30 consecutive days. Build consistency day by day.
              </p>
            </div>
          </div>
        </section>

        <!-- Section 4: Philosophy -->
        <section class="section fade-in-up" style="text-align:center;padding:var(--space-8) 0;">
          <div style="font-family:var(--font-display);font-size:var(--text-2xl);color:var(--color-primary);
                      letter-spacing:0.04em;line-height:1;margin-bottom:var(--space-6);
                      text-shadow:0 0 40px oklch(from var(--color-primary) l c h / 0.3);">
            DISCIPLINE<br>OVER<br>MOTIVATION.
          </div>
          <p style="font-size:var(--text-sm);color:var(--color-text-muted);line-height:1.8;max-width:340px;margin:0 auto;">
            This challenge is built around your actual life — your training style, your schedule, your goals.
            The rules exist to build the habits that compound into results.
          </p>
        </section>
      </div>
    `;
  };

  // ── 18. renderSettingsView ────────────────────────────
  window.App.renderSettingsView = function(container) {
    const s = window.App.state.settings;
    const programStarted = !!window.App.state.programStart;

    const fieldStyle = `width:100%;padding:var(--space-3);background:var(--color-surface);
      border:1px solid var(--color-border);border-radius:var(--radius-md);
      color:var(--color-text);font-family:var(--font-body);font-size:16px;`;

    const labelStyle = `display:block;font-size:var(--text-xs);font-weight:700;
      color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:var(--space-2);`;

    const groupStyle = `display:flex;flex-direction:column;gap:var(--space-5);`;

    const bottlesCount = (waterGoal, bottleSize) =>
      (waterGoal / bottleSize).toFixed(1);

    container.innerHTML = `
      <div style="max-width:480px;margin:0 auto;padding:0 var(--space-4) var(--space-20);">

        <header class="header fade-in-up" style="padding-top:var(--space-8);margin-bottom:var(--space-6);">
          <h1 style="font-family:var(--font-display);font-size:var(--text-xl);letter-spacing:0.06em;
                      background:linear-gradient(135deg,#fdba74,var(--color-primary));
                      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;;">
            SETTINGS
          </h1>
          <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:var(--space-1);">
            Customize your daily targets.
          </p>
        </header>

        <!-- NUTRITION -->
        <section class="section fade-in-up">
          <h2 class="section__title">Nutrition</h2>
          <div class="card" style="display:flex;flex-direction:column;gap:var(--space-5);">

            <div>
              <label style="${labelStyle}" for="s-protein">Protein Goal (g/day)</label>
              <input id="s-protein" type="number" min="100" max="300" value="${s.proteinGoal}" style="${fieldStyle}" data-setting="proteinGoal">
            </div>

            <div>
              <label style="${labelStyle}" for="s-cals">Calorie Ceiling (cal/day)</label>
              <input id="s-cals" type="number" min="1500" max="4000" value="${s.calorieCeiling}" style="${fieldStyle}" data-setting="calorieCeiling">
            </div>

          </div>
        </section>

        <!-- HYDRATION -->
        <section class="section fade-in-up">
          <h2 class="section__title">Hydration</h2>
          <div class="card" style="display:flex;flex-direction:column;gap:var(--space-5);">

            <div>
              <label style="${labelStyle}" for="s-water">Water Goal (oz/day)</label>
              <input id="s-water" type="number" min="40" max="300" value="${s.waterGoal}" style="${fieldStyle}" data-setting="waterGoal">
              <div id="water-bottle-display" style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:var(--space-2);">
                = ${bottlesCount(s.waterGoal, s.waterBottleSize)} bottles of ${s.waterBottleSize} oz
              </div>
            </div>

            <div>
              <label style="${labelStyle}" for="s-bottle-size">Water Bottle Size (oz)</label>
              <select id="s-bottle-size" style="${fieldStyle}" data-setting="waterBottleSize">
                <option value="32"  ${s.waterBottleSize === 32  ? 'selected' : ''}>32 oz</option>
                <option value="40"  ${s.waterBottleSize === 40  ? 'selected' : ''}>40 oz (default)</option>
                <option value="64"  ${s.waterBottleSize === 64  ? 'selected' : ''}>64 oz</option>
              </select>
            </div>

          </div>
        </section>

        <!-- SLEEP -->
        <section class="section fade-in-up">
          <h2 class="section__title">Sleep Window</h2>
          <div class="card" style="display:flex;flex-direction:column;gap:var(--space-5);">

            <div style="font-size: var(--text-xs); color: var(--color-text-muted); line-height: 1.4; border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-2); margin-bottom: var(--space-1);">
              ℹ️ Weekday rules are configured below. Weekends automatically shift to 11:30 PM Bedtime (11:45 PM grace) and 7:00 AM Wake time (7:15 AM grace).
            </div>

            <div>
              <label style="${labelStyle}" for="s-bedtime">Bedtime Target</label>
              <input id="s-bedtime" type="time" value="${s.bedtimeTarget}" style="${fieldStyle}" data-setting="bedtimeTarget">
            </div>

            <div>
              <label style="${labelStyle}" for="s-wake">Wake Time Target</label>
              <input id="s-wake" type="time" value="${s.wakeTarget}" style="${fieldStyle}" data-setting="wakeTarget">
            </div>

            <div>
              <label style="${labelStyle}" for="s-grace">Grace Window</label>
              <select id="s-grace" style="${fieldStyle}" data-setting="graceWindowMin">
                <option value="0"  ${s.graceWindowMin === 0  ? 'selected' : ''}>0 min (strict)</option>
                <option value="15" ${s.graceWindowMin === 15 ? 'selected' : ''}>15 min (default)</option>
                <option value="30" ${s.graceWindowMin === 30 ? 'selected' : ''}>30 min (relaxed)</option>
              </select>
            </div>

          </div>
        </section>

        <!-- PROGRAM -->
        <section class="section fade-in-up">
          <h2 class="section__title">Program</h2>
          <div class="card">
            <label style="${labelStyle}" for="s-start">Program Start Date</label>
            <input id="s-start" type="date"
              value="${window.App.state.programStart || ''}"
              ${programStarted ? 'disabled' : ''}
              style="${fieldStyle}${programStarted ? 'opacity:0.5;cursor:not-allowed;' : ''}"
              data-setting="__programStart">
            ${programStarted
              ? `<div style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:var(--space-2);">Start date is locked once the program begins.</div>`
              : `<div style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:var(--space-2);">Set before starting the program. Locks on first day.</div>`
            }
          </div>
        </section>

        <!-- FORGOT TO MARK / FLEX DAYS -->
        <section class="section fade-in-up">
          <h2 class="section__title">Forgot to Mark?</h2>
          <div style="display:flex;flex-direction:column;gap:var(--space-4);">
            <div class="card" style="display:flex;flex-direction:column;gap:var(--space-4);">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-weight:700;font-size:var(--text-sm);color:var(--color-text);">Mulligans</div>
                  <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:2px;">Go back and edit a previous day</div>
                </div>
                <div style="font-family:var(--font-display);font-size:var(--text-lg);color:${(10 - (window.App.state.mulligansUsed || 0)) > 0 ? 'var(--color-primary)' : 'var(--color-danger)'};">
                  ${10 - (window.App.state.mulligansUsed || 0)} / 10
                </div>
              </div>
              <div style="background:var(--color-surface-offset);height:6px;border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${((10 - (window.App.state.mulligansUsed || 0)) / 10) * 100}%;background:var(--color-primary);border-radius:99px;transition:width 0.3s;"></div>
              </div>
              ${(10 - (window.App.state.mulligansUsed || 0)) > 0 ? `
                <div>
                  <label style="${labelStyle}" for="mulligan-date">Select a date to edit</label>
                  <input id="mulligan-date" type="date"
                    min="${window.App.state.programStart || ''}"
                    max="${window.App.getTodayKey()}"
                    style="${fieldStyle}"
                    placeholder="Pick a date">
                </div>
                <button id="btn-use-mulligan" class="btn-primary" style="width:100%;">
                  📝 Use Mulligan & Edit Day
                </button>
              ` : `
                <div style="text-align:center;padding:var(--space-3);color:var(--color-text-muted);font-size:var(--text-sm);font-weight:600;">
                  🚫 All mulligans used — no more edits allowed.
                </div>
              `}
            </div>

            <div class="card" style="display:flex;flex-direction:column;gap:var(--space-4);">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-weight:700;font-size:var(--text-sm);color:var(--color-text);">Flex Days</div>
                  <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:2px;">Remaining flex days allowed</div>
                </div>
                <div style="font-family:var(--font-display);font-size:var(--text-lg);color:${window.App.getFlexDaysRemaining() > 0 ? 'var(--color-primary)' : 'var(--color-danger)'};">
                  ${window.App.getFlexDaysRemaining()} / ${window.App.state.flexDaysMax || 0}
                </div>
              </div>
              <div style="background:var(--color-surface-offset);height:6px;border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${(window.App.state.flexDaysMax || 0) > 0 ? (window.App.getFlexDaysRemaining() / window.App.state.flexDaysMax) * 100 : 0}%;background:var(--color-primary);border-radius:99px;transition:width 0.3s;"></div>
              </div>
            </div>
          </div>
        </section>

        <!-- DANGER ZONE -->
        <section class="section fade-in-up">
          <h2 class="section__title" style="color:var(--color-danger);">Danger Zone</h2>
          <details style="border:1px solid var(--color-danger);border-radius:var(--radius-lg);overflow:hidden;">
            <summary style="padding:var(--space-4);cursor:pointer;font-weight:700;font-size:var(--text-sm);
                            color:var(--color-danger);list-style:none;display:flex;align-items:center;gap:var(--space-2);
                            background:oklch(from var(--color-danger) l c h / 0.06);">
              ⚠️ Advanced Options
            </summary>
            <div class="card" style="border-radius:0;border:none;display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-4);">

              <button id="btn-export" class="btn-ghost" style="width:100%;">
                ⬇️ Export Data (JSON)
              </button>

              <label class="btn-ghost" style="width:100%;display:flex;align-items:center;justify-content:center;gap:var(--space-2);cursor:pointer;">
                ⬆️ Import Data (JSON)
                <input id="import-file" type="file" accept=".json" style="display:none;">
              </label>

              <div style="border-top:1px solid var(--color-border);padding-top:var(--space-3);">
                <label style="${labelStyle}color:var(--color-danger);">Type "RESET" to confirm data wipe</label>
                <div style="display:flex;gap:var(--space-2);">
                  <input id="reset-confirm" type="text" placeholder="RESET"
                    style="${fieldStyle}flex:1;border-color:oklch(from var(--color-danger) l c h / 0.4);">
                  <button id="btn-reset" class="btn-primary"
                    style="background:var(--color-danger);white-space:nowrap;padding:0 var(--space-4);">
                    Reset All
                  </button>
                </div>
              </div>

            </div>
          </details>
        </section>
      </div>
    `;

    // ── Event bindings ─────────────────────────────────

    // Generic settings inputs
    container.querySelectorAll('[data-setting]').forEach(el => {
      el.addEventListener('change', () => {
        const key = el.dataset.setting;
        let val = el.type === 'number' ? parseFloat(el.value) : el.value;

        if (el.tagName === 'SELECT' && el.dataset.setting !== 'bedtimeTarget' && el.dataset.setting !== 'wakeTarget') {
          val = isNaN(Number(el.value)) ? el.value : Number(el.value);
        }

        if (key === '__programStart') {
          window.App.state.programStart = val || null;
        } else {
          window.App.state.settings[key] = val;
        }

        window.App.saveState();

        // Recalculate bottle display live
        const waterGoal = window.App.state.settings.waterGoal;
        const bottleSize = window.App.state.settings.waterBottleSize;
        const display = container.querySelector('#water-bottle-display');
        if (display) {
          display.textContent = `= ${bottlesCount(waterGoal, bottleSize)} bottles of ${bottleSize} oz`;
        }
      });
    });

    // Mulligan - Forgot to Mark
    const btnMulligan = container.querySelector('#btn-use-mulligan');
    if (btnMulligan) {
      btnMulligan.addEventListener('click', () => {
        const dateInput = container.querySelector('#mulligan-date');
        const selectedDate = dateInput ? dateInput.value : '';
        if (!selectedDate) {
          alert('Please select a date to edit.');
          return;
        }
        const today = window.App.getTodayKey();
        if (selectedDate > today) {
          alert('You cannot edit a future date.');
          return;
        }
        if (window.App.state.programStart && selectedDate < window.App.state.programStart) {
          alert('That date is before your program started.');
          return;
        }
        // Use a mulligan
        window.App.state.mulligansUsed = (window.App.state.mulligansUsed || 0) + 1;
        window.App.saveState();
        // Switch to the Today view with that date active
        window.App.activeDateKey = selectedDate;
        window.App._skipDateReset = true;
        window.location.hash = '#today';
      });
    }

    // Export
    container.querySelector('#btn-export').addEventListener('click', () => {
      const json = window.App.exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `70hard-backup-${window.App.getTodayKey()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import
    container.querySelector('#import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const ok = window.App.importData(ev.target.result);
        alert(ok ? '✅ Data imported successfully. Reload the app.' : '❌ Import failed. Invalid file.');
        if (ok) window.App.renderSettingsView(container);
      };
      reader.readAsText(file);
    });

    // Reset
    container.querySelector('#btn-reset').addEventListener('click', () => {
      const confirmInput = container.querySelector('#reset-confirm').value.trim();
      if (confirmInput !== 'RESET') {
        alert('Type exactly "RESET" to confirm.');
        return;
      }
      localStorage.clear();
      window.App.state = window.App.initState();
      window.App.renderSettingsView(container);
      alert('✅ All data has been cleared.');
    });
  };

  // Initialize immediately
  window.App.state = window.App.initState();

})();

/* ═══════════════════════════════════════════════════════
   NAVIGATION SHELL + ROUTER
   ═══════════════════════════════════════════════════════ */
(function() {

  // ── SVG Icons ─────────────────────────────────────────
  const ICONS = {
    flame: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-4.97 0-9-3.58-9-8 0-3.07 2.1-6.28 4.2-8.4.48-.48 1.3-.14 1.3.54 0 1.6.68 3.2 1.8 4.06.14.1.32.02.36-.14.3-1.2.84-2.82 1.94-4.46C12.8 4.6 13.5 3.1 13.5 1.5c0-.56.63-.88 1.06-.53C17.36 3.2 21 7.07 21 11c0 6.63-4.03 12-9 12z"/></svg>`,
    clipboard: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M17 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>`,
    chart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="14" width="4" height="8"/><rect x="9" y="9" width="4" height="13"/><rect x="16" y="4" width="4" height="18"/></svg>`,
    scroll: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`,
    gear: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    xmark: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    warn: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    flameLg: `<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-4.97 0-9-3.58-9-8 0-3.07 2.1-6.28 4.2-8.4.48-.48 1.3-.14 1.3.54 0 1.6.68 3.2 1.8 4.06.14.1.32.02.36-.14.3-1.2.84-2.82 1.94-4.46C12.8 4.6 13.5 3.1 13.5 1.5c0-.56.63-.88 1.06-.53C17.36 3.2 21 7.07 21 11c0 6.63-4.03 12-9 12z"/></svg>`,
  };

  const TABS = [
    { id: 'today',    hash: '#today',    icon: ICONS.flame,     label: 'TODAY'    },
    { id: 'log',      hash: '#log',      icon: ICONS.clipboard, label: 'LOG'      },
    { id: 'progress', hash: '#progress', icon: ICONS.chart,     label: 'PROGRESS' },
    { id: 'rules',    hash: '#rules',    icon: ICONS.scroll,    label: 'RULES'    },
    { id: 'settings', hash: '#settings', icon: ICONS.gear,      label: 'SETTINGS' },
  ];

  // ── Onboarding ────────────────────────────────────────
  function renderOnboarding(root) {
    root.innerHTML = `
      <div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;
                  justify-content:center;padding:calc(env(safe-area-inset-top, 0px) + var(--space-8)) var(--space-8) calc(env(safe-area-inset-bottom, 0px) + var(--space-8));text-align:center;
                  background:var(--color-bg);position:relative;overflow:hidden;">
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse 60% 50% at 50% 60%,
             oklch(from #f97316 l c h / 0.1),transparent 70%);pointer-events:none;"></div>

        <div style="color:var(--color-primary);margin-bottom:var(--space-8);
                    animation:flamePulse 2s ease-in-out infinite alternate;">${ICONS.flameLg.replace('width="40" height="40"','width="80" height="80"')}</div>

        <h1 style="font-family:var(--font-display);font-size:var(--text-2xl);
                   color:var(--color-primary);letter-spacing:0.04em;line-height:1;
                   margin-bottom:var(--space-4);">ARE YOU READY?</h1>

        <p style="font-family:var(--font-body);font-size:var(--text-base);
                  color:var(--color-text-muted);margin-bottom:var(--space-12);
                  max-width:280px;line-height:1.7;">
          30 days. 7 rules. No excuses.
        </p>

        <button id="btn-begin" class="btn-primary"
          style="width:100%;max-width:320px;font-size:var(--text-base);
                 padding:var(--space-4);letter-spacing:0.06em;margin-bottom:var(--space-4);">
          BEGIN CHALLENGE
        </button>

        <a id="link-rules" href="#rules"
          style="font-size:var(--text-sm);color:var(--color-text-muted);
                 text-decoration:underline;cursor:pointer;">
          Review the Rules first →
        </a>
      </div>
      <style>
        @keyframes flamePulse {
          from { transform:scale(1) translateY(0); filter:drop-shadow(0 0 8px oklch(from #f97316 l c h / 0.4)); }
          to   { transform:scale(1.08) translateY(-6px); filter:drop-shadow(0 0 24px oklch(from #f97316 l c h / 0.7)); }
        }
      </style>
    `;

    root.querySelector('#btn-begin').addEventListener('click', () => {
      const today = window.App.getTodayKey();
      window.App.state.programStart = today;
      window.App.saveState();
      
      renderShell(root);
      const targetHash = '#today';
      window.location.hash = targetHash;
      
      // Force load the view since hashchange might not fire if hash was already #today
      requestAnimationFrame(() => loadView('today'));
    });

    root.querySelector('#link-rules').addEventListener('click', (e) => {
      e.preventDefault();
      renderShell(root);
      navigate('rules');
    });
  }

  // ── Shell ─────────────────────────────────────────────
  function renderShell(root) {
    const state = window.App.state;
    const today = window.App.getTodayKey();
    const dayNum = window.App.getDayNumber(today);
    const displayDay = state.programStart ? Math.min(Math.max(dayNum, 1), state.programLengthDays || 30) : '–';

    const phaseLabel = state.currentPhase === 'phase1'
      ? `<span class="badge badge-phase1">PHASE 1 — CALIBRATION</span>`
      : state.currentPhase === 'phase2'
      ? `<span class="badge badge-phase2">PHASE 2 — LOCKED</span>`
      : `<span class="badge" style="background:var(--color-surface-offset);color:var(--color-text-muted);">NOT STARTED</span>`;

    root.innerHTML = `
      <div class="app-shell" style="display:flex;flex-direction:column;min-height:100dvh;max-width:480px;margin:0 auto;">
        <header class="top-bar" style="display:flex;align-items:center;justify-content:space-between;
               padding: calc(env(safe-area-inset-top, 0px) + var(--space-3)) var(--space-4) var(--space-3);
               border-bottom:1px solid var(--color-border);
               background:var(--color-bg);position:sticky;top:0;z-index:50;
               backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);">
          <div style="display:flex;align-items:center;gap:var(--space-2);color:var(--color-primary);" class="icon-flame-hero">
            ${ICONS.flameLg.replace('width="40" height="40"','width="24" height="24"')}
            <span style="font-family:var(--font-display);font-size:var(--text-lg);
                         letter-spacing:0.06em;color:var(--color-primary);">MONTHLY DISCIPLINED</span>
          </div>
          <div id="shell-phase-badge">${phaseLabel}</div>
          <div style="font-size:var(--text-xs);color:var(--color-text-faint);
                      font-weight:700;letter-spacing:0.08em;text-align:right;">
            DAY<br>${displayDay}/${state.programLengthDays || 30}
          </div>
        </header>

        <main id="view-root" style="flex:1;overflow-y:auto;padding-bottom:var(--space-2);"></main>

        <nav class="bottom-nav" role="tablist" aria-label="Main navigation"
             style="position:sticky;bottom:0;z-index:50;background:var(--color-surface);border-top:1px solid var(--color-border);padding-bottom:env(safe-area-inset-bottom, 0px);">
          <div style="display:flex;width:100%;">
          ${TABS.map(t => {
            const active = getActiveTab() === t.id;
            return `
            <button class="bottom-nav__item ${active ? 'bottom-nav__item--active' : ''}" id="tab-${t.id}"
                    data-hash="${t.hash}"
                    role="tab"
                    aria-selected="${active}"
                    aria-controls="view-root"
                    style="min-height:56px;min-width:44px;"
                    aria-label="${t.label}">
              <span class="bottom-nav__icon">${t.icon}</span>
              ${t.label}
            </button>
          `;}).join('')}
          </div>
        </nav>
      </div>
    `;

    root.querySelectorAll('.bottom-nav__item').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.hash = btn.dataset.hash;
      });
    });
  }

  // ── Router ────────────────────────────────────────────
  function getActiveTab() {
    const h = window.location.hash;
    if (!h || h === '#today')    return 'today';
    if (h === '#log')            return 'log';
    if (h === '#progress')       return 'progress';
    if (h === '#rules')          return 'rules';
    if (h === '#settings')       return 'settings';
    return 'today';
  }

  function navigate(tabId) {
    window.location.hash = '#' + tabId;
  }

  function updateTabHighlight(tabId) {
    document.querySelectorAll('.bottom-nav__item').forEach(btn => {
      const active = btn.id === 'tab-' + tabId;
      btn.classList.toggle('bottom-nav__item--active', active);
    });
  }

  function updateTopBar() {
    const state = window.App.state;
    const badge = document.getElementById('shell-phase-badge');
    if (!badge) return;
    const phaseLabel = state.currentPhase === 'phase1'
      ? `<span class="badge badge-phase1">PHASE 1 — CALIBRATION</span>`
      : state.currentPhase === 'phase2'
      ? `<span class="badge badge-phase2">PHASE 2 — LOCKED</span>`
      : `<span class="badge" style="background:var(--color-surface-offset);color:var(--color-text-muted);">NOT STARTED</span>`;
    badge.innerHTML = phaseLabel;
  }

  let _transitioning = false;
  function loadView(tabId) {
    const viewRoot = document.getElementById('view-root');
    if (!viewRoot) return;
    if (_transitioning) return;

    if (tabId === 'today' && !window.App._skipDateReset) {
      window.App.activeDateKey = null;
    }
    window.App._skipDateReset = false;

    updateTabHighlight(tabId);
    updateTopBar();

    _transitioning = true;
    viewRoot.style.transition = 'opacity 150ms ease';
    viewRoot.style.opacity = '0';

    setTimeout(() => {
      viewRoot.innerHTML = '';
      const fn = {
        today:    () => window.App.renderTodayView(viewRoot),
        log:      () => renderLogView(viewRoot),
        progress: () => window.App.renderProgressView(viewRoot),
        rules:    () => window.App.renderRulesView(viewRoot),
        settings: () => window.App.renderSettingsView(viewRoot),
      }[tabId];
      try {
        if (fn) fn();
      } catch(err) {
        console.error('[Router] View render error:', err);
        viewRoot.innerHTML = `<div style="padding:2rem;color:#ef4444;font-family:monospace;font-size:12px;">View error: ${err.message}</div>`;
      }
      viewRoot.style.transition = 'opacity 200ms ease';
      viewRoot.style.opacity = '1';
      _transitioning = false;
    }, 150);
  }

  // ── Log View ──────────────────────────────────────────
  function renderLogView(container) {
    const state = window.App.state;
    const dayKeys = Object.keys(state.days).sort().reverse();

    const TASK_LABELS = {
      workout:'💪 Workout', photo:'📸 Photo', water:'💧 Water',
      bible:'📖 Bible', 'diet':'🥩 Diet', 'sleep':'😴 Sleep',
    };

    const taskRows = (tasks) => {
      const rows = [];
      const t = tasks;
      const dietDone = t.diet.cheatDay || (t.diet.weighed && t.diet.tracked && t.diet.proteinMet && t.diet.caloriesOk);
      const sleepDone = t.sleep.bedtimeHit && t.sleep.wakeHit;
      const wkDone = typeof t.workout === 'boolean' ? t.workout : (t.workout.activeMinutes || t.workout.steps || t.workout.caloriesBurned);
      const checks = [
        { label:'💪 Workout',       done: wkDone },
        { label:'📸 Photo',         done: t.photo },
        { label:'🥩 Diet',          done: dietDone, note: t.diet.cheatDay ? 'Cheat day' : '' },
        { label:'💧 Water',         done: t.water },
        { label:'📖 Bible',         done: t.bible },
        { label:'😴 Sleep',         done: sleepDone },
      ];
      return checks.map(c => `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:var(--space-2) 0;border-bottom:1px solid var(--color-border);">
          <span style="font-size:var(--text-sm);color:var(--color-text-muted);">${c.label}${c.note ? ` <em style="color:var(--color-gold);">(${c.note})</em>` : ''}</span>
          <span style="color:${c.done ? 'var(--color-success)' : 'var(--color-danger)'};">${c.done ? ICONS.check : ICONS.xmark}</span>
        </div>
      `).join('');
    };

    if (dayKeys.length === 0) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    min-height:60vh;text-align:center;padding:var(--space-8);">
          <div style="color:var(--color-primary);opacity:0.4;margin-bottom:var(--space-4);
                      animation:flamePulse 2s ease-in-out infinite alternate;">
            ${ICONS.flameLg.replace('width="40" height="40"','width="64" height="64"')}
          </div>
          <div style="font-family:var(--font-display);font-size:var(--text-xl);
                      color:var(--color-text-faint);letter-spacing:0.06em;">NO DAYS LOGGED</div>
          <p style="color:var(--color-text-faint);font-size:var(--text-sm);margin-top:var(--space-3);">
            Complete your first day to see it here.
          </p>
        </div>
        <style>@keyframes flamePulse{from{transform:scale(1);opacity:.4}to{transform:scale(1.1);opacity:.8}}</style>
      `;
      return;
    }

    const cards = dayKeys.map(key => {
      const rec = state.days[key];
      const isP1 = rec.phase === 'phase1';
      const date = new Date(key + 'T00:00:00');
      const dateStr = date.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
      const statusIcon = rec.completed
        ? `<span style="color:var(--color-success);">${ICONS.check}</span>`
        : isP1
        ? `<span style="color:var(--color-gold);">${ICONS.warn}</span>`
        : `<span style="color:var(--color-danger);">${ICONS.xmark}</span>`;

      const id = 'log-' + key.replace(/-/g,'');
      return `
        <div class="card fade-in-up" style="margin-bottom:var(--space-3);padding:0;overflow:hidden;">
          <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-4);cursor:pointer;"
               onclick="document.getElementById('${id}').style.display=
                        document.getElementById('${id}').style.display==='none'?'block':'none'">
            <div>
              <div style="font-family:var(--font-display);font-size:var(--text-lg);
                          color:var(--color-text);letter-spacing:0.04em;">DAY ${rec.dayNumber}</div>
              <div style="font-size:var(--text-xs);color:var(--color-text-faint);">${dateStr}</div>
            </div>
            <div style="flex:1;display:flex;gap:var(--space-2);flex-wrap:wrap;">
              ${isP1
                ? `<span class="badge badge-phase1">Phase 1</span>`
                : `<span class="badge badge-phase2">Phase 2</span>`}
            </div>
            <div style="display:flex;align-items:center;gap:var(--space-2);">
              ${statusIcon}
              <span style="color:var(--color-text-faint);font-size:1rem;">▼</span>
            </div>
          </div>
          <div id="${id}" style="display:none;padding:0 var(--space-4) var(--space-4);">
            ${rec.tasks ? taskRows(rec.tasks) : '<p style="color:var(--color-text-faint);font-size:var(--text-sm);">No task data.</p>'}
            ${(rec.notes && isP1) ? `
              <div style="margin-top:var(--space-3);padding:var(--space-3);
                          background:var(--color-surface);border-radius:var(--radius-md);
                          border-left:3px solid var(--color-phase1);">
                <div style="font-size:var(--text-xs);color:var(--color-phase1);
                             font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
                             margin-bottom:var(--space-1);">Friction Note</div>
                <div style="font-size:var(--text-sm);color:var(--color-text-muted);
                             line-height:1.6;">${rec.notes}</div>
              </div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="padding:var(--space-4) var(--space-4) var(--space-20);">
        <h1 style="font-family:var(--font-display);font-size:var(--text-xl);
                   letter-spacing:0.06em;color:var(--color-text);margin-bottom:var(--space-6);">
          ACTIVITY LOG
        </h1>
        ${cards}
      </div>
    `;
  }

  // ── initApp ───────────────────────────────────────────
  window.App.initApp = function() {
    const root = document.getElementById('app');
    if (!root) return;

    // First-time user: show onboarding
    if (window.App.state.currentPhase === 'setup') {
      renderOnboarding(root);
      return;
    }

    renderShell(root);
    console.log('[App] Shell rendered, loading initial view');

    // Ensure DOM is ready before initial load
    requestAnimationFrame(() => {
      const tab = getActiveTab();
      loadView(tab);
    });
  };

  // Hash-change router - bind once globally
  window.addEventListener('hashchange', () => {
    // Only route if we are out of setup phase
    if (window.App.state.currentPhase !== 'setup') {
      loadView(getActiveTab());
    }
  });

  // Expose log view for external calls
  window.App.renderLogView = renderLogView;

  // Boot the app robustly
  const boot = () => {
    if (window.App && window.App.initApp) {
      window.App.initApp();
    }
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
