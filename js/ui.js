// UI Manager - handles menu, HUD, screens
class UIManager {
    constructor(game) {
        this.game = game;
        this.canvas = game.canvas;
        this.ctx = game.ctx;
        this.screen = GameState.MENU;
        this.goalAnimationTimer = 0;
        this.goalScorer = null;
        
        // Bind UI events
        this.bindEvents();
    }

    bindEvents() {
        // Buttons
        const btnPlay = document.getElementById('btn-play');
        const btnSettings = document.getElementById('btn-settings');
        const btnCredits = document.getElementById('btn-credits');
        const btnBackMenu = document.getElementById('btn-back-menu');
        const btnBackMenu2 = document.getElementById('btn-back-menu-2');
        const btnResume = document.getElementById('btn-resume');
        const btnRestart = document.getElementById('btn-restart');
        const btnQuitMenu = document.getElementById('btn-quit-menu');
        const btnRematch = document.getElementById('btn-rematch');
        const btnMainMenu = document.getElementById('btn-main-menu');
        
        if (btnPlay) btnPlay.addEventListener('click', () => this.startGame());
        if (btnSettings) btnSettings.addEventListener('click', () => this.showScreen(GameState.MENU, 'settings'));
        if (btnCredits) btnCredits.addEventListener('click', () => this.showScreen(GameState.MENU, 'credits'));
        if (btnBackMenu) btnBackMenu.addEventListener('click', () => this.showScreen(GameState.MENU, 'main'));
        if (btnBackMenu2) btnBackMenu2.addEventListener('click', () => this.showScreen(GameState.MENU, 'main'));
        if (btnResume) btnResume.addEventListener('click', () => this.resumeGame());
        if (btnRestart) btnRestart.addEventListener('click', () => this.restartGame());
        if (btnQuitMenu) btnQuitMenu.addEventListener('click', () => this.quitToMenu());
        if (btnRematch) btnRematch.addEventListener('click', () => this.restartGame());
        if (btnMainMenu) btnMainMenu.addEventListener('click', () => this.quitToMenu());
        
        const aiDifficulty = document.getElementById('ai-difficulty');
        const matchDuration = document.getElementById('match-duration');
        const soundEnabled = document.getElementById('sound-enabled');
        const particlesEnabled = document.getElementById('particles-enabled');
        
        if (aiDifficulty) aiDifficulty.addEventListener('change', (e) => {
            this.game.difficulty = e.target.value;
        });
        if (matchDuration) matchDuration.addEventListener('change', (e) => {
            this.game.matchTimer = parseInt(e.target.value) * 60;
        });
        if (soundEnabled) soundEnabled.addEventListener('change', (e) => {
            this.game.audio.setEnabled(e.target.checked);
        });
        if (particlesEnabled) particlesEnabled.addEventListener('change', (e) => {
            // Toggle particles
        });
    }

    showScreen(state, screenName) {
        // Show appropriate screen
        switch (screenName) {
            case 'main':
                document.getElementById('main-menu').classList.add('active');
                break;
            case 'settings':
                document.getElementById('settings-screen').classList.add('active');
                break;
            case 'credits':
                document.getElementById('credits-screen').classList.add('active');
                break;
            default:
                document.getElementById('main-menu').classList.add('active');
        }
        
        // Hide all others
        document.getElementById('settings-screen').classList.remove('active');
        document.getElementById('credits-screen').classList.remove('active');
        document.getElementById('pause-menu').classList.remove('active');
        document.getElementById('game-hud').classList.remove('active');
        document.getElementById('goal-celebration').classList.add('hidden');
        document.getElementById('match-end').classList.add('hidden');
        
        // Show main menu by default
        document.getElementById('main-menu').classList.add('active');
        document.getElementById('main-menu').classList.remove('hidden');
    }

    showPause() {
        document.getElementById('pause-menu').classList.add('active');
    }

    hidePause() {
        document.getElementById('pause-menu').classList.remove('active');
    }

    startGame() {
        document.getElementById('main-menu').classList.remove('active');
        document.getElementById('pause-menu').classList.remove('active');
        document.getElementById('game-hud').classList.add('active');
        document.getElementById('goal-celebration').classList.add('hidden');
        document.getElementById('match-end').classList.add('hidden');
        
        this.game.startMatch();
    }

    resumeGame() {
        this.hidePause();
        this.game.state = GameState.PLAYING;
    }

    restartGame() {
        this.game.startMatch();
        this.hidePause();
    }

    quitToMenu() {
        this.showScreen(GameState.MENU, 'main');
        this.game.state = GameState.MENU;
    }

    updateHUD() {
        // Update score
        const redScoreEl = document.getElementById('red-score');
        const blueScoreEl = document.getElementById('blue-score');
        const timerEl = document.getElementById('match-timer');
        const possessionEl = document.getElementById('possession-team');
        const controlledNameEl = document.getElementById('controlled-player-name');
        
        if (redScoreEl) redScoreEl.textContent = this.game.redScore;
        if (blueScoreEl) blueScoreEl.textContent = this.game.blueScore;
        
        // Timer format mm:ss
        const minutes = Math.floor(this.game.matchTimer / 60);
        const seconds = Math.floor(this.game.matchTimer % 60);
        if (timerEl) timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Possession
        if (possessionEl) possessionEl.textContent = this.game.possessionTeam === 'red' ? 'ĐỎ' : 'XANH';
        
        // Controlled player name
        if (controlledNameEl) {
            const player = this.game.currentControlledPlayer;
            if (player) {
                controlledNameEl.textContent = player.role.toUpperCase();
            }
        }
    }

    // Show goal celebration
    showGoalCelebration(scorer, team) {
        const goalText = document.getElementById('goal-text');
        const scorerText = document.getElementById('scorer-text');
        
        if (goalText) goalText.textContent = 'GOAL!';
        if (scorerText) scorerText.textContent = `${scorer ? scorer.playerNum : ''} scored!`;
        
        document.getElementById('goal-celebration').classList.remove('hidden');
        document.getElementById('goal-celebration').classList.add('active');
        
        this.goalAnimationTimer = 2.5; // seconds
    }

    hideGoalCelebration() {
        document.getElementById('goal-celebration').classList.add('hidden');
    }

    updateGoalCelebration(dt) {
        this.goalAnimationTimer -= dt;
        if (this.goalAnimationTimer <= 0) {
            document.getElementById('goal-celebration').classList.add('hidden');
        }
    }
}
