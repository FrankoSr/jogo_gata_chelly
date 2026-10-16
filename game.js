// ============================================================================
// SUPER CHELLY: O RESGATE DOS FILHOTES
// Jogo de Ação e Plataforma 2D com Temática Infantil (Otimizado 60 FPS)
// ============================================================================

const canvas = document.getElementById('gameCanvas');
// alpha: false evita composição transparente com o fundo da página (ganho de GPU)
const ctx = canvas.getContext('2d', { alpha: false });

// UI Elements
const hudLives = document.getElementById('hud-lives');
const hudKittens = document.getElementById('hud-kittens');
const hudScore = document.getElementById('hud-score');
const hudLevelName = document.getElementById('hud-level-name');
const bossHud = document.getElementById('boss-hud');
const bossBarFill = document.getElementById('boss-bar-fill');

const overlayScreen = document.getElementById('overlay-screen');
const modalIcon = document.getElementById('modal-icon');
const modalTitle = document.getElementById('modal-title');
const modalSubtitle = document.getElementById('modal-subtitle');
const btnStart = document.getElementById('btn-start');
const btnSound = document.getElementById('btn-sound');
const btnRestart = document.getElementById('btn-restart');
const btnHelp = document.getElementById('btn-help');

// ============================================================================
// CACHE DE SPRITES OFFSCREEN (EVITA FILLTEXT DE EMOJIS LENTOS A CADA FRAME)
// ============================================================================
const SpriteCache = {
  sprites: {},

  create(key, w, h, drawFn) {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    drawFn(octx, w, h);
    this.sprites[key] = off;
  },

  init() {
    // Peixinho Dourado (Item)
    this.create('fish', 36, 36, (c) => {
      c.translate(18, 18);
      c.fillStyle = '#ffb703';
      c.strokeStyle = '#d66853';
      c.lineWidth = 2;
      // Rabo
      c.beginPath();
      c.moveTo(-8, 0);
      c.lineTo(-16, -8);
      c.lineTo(-14, 0);
      c.lineTo(-16, 8);
      c.closePath();
      c.fill();
      c.stroke();
      // Corpo
      c.beginPath();
      c.ellipse(2, 0, 11, 7, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      // Olho
      c.fillStyle = '#1d3557';
      c.beginPath();
      c.arc(7, -2, 2, 0, Math.PI * 2);
      c.fill();
    });

    // Pote de Leite Morno (Item Vida)
    this.create('milk', 36, 36, (c) => {
      c.translate(18, 18);
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#457b9d';
      c.lineWidth = 2.2;
      c.beginPath();
      c.roundRect(-9, -8, 18, 20, 4);
      c.fill();
      c.stroke();
      // Tampa rosa
      c.fillStyle = '#ff4d6d';
      c.beginPath();
      c.roundRect(-11, -12, 22, 5, 2);
      c.fill();
      // Coraçãozinho no pote
      c.fillStyle = '#ff4d6d';
      c.beginPath();
      c.arc(-2.5, 1, 2.5, 0, Math.PI * 2);
      c.arc(2.5, 1, 2.5, 0, Math.PI * 2);
      c.moveTo(-5, 2);
      c.lineTo(0, 7);
      c.lineTo(5, 2);
      c.fill();
    });

    // Super Novelo Arco-Íris (Power-up)
    this.create('yarn_power', 38, 38, (c) => {
      c.translate(19, 19);
      const grad = c.createLinearGradient(-12, -12, 12, 12);
      grad.addColorStop(0, '#ff4d6d');
      grad.addColorStop(0.5, '#ffb703');
      grad.addColorStop(1, '#3a86ff');
      c.fillStyle = grad;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(0, 0, 13, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(-3, -2, 9, -0.4, 1.8);
      c.stroke();
      c.beginPath();
      c.arc(3, 2, 8, 1.4, 3.6);
      c.stroke();
    });

    // Ossinho de Borracha (Projétil do Dobermann)
    this.create('bone', 34, 24, (c) => {
      c.translate(17, 12);
      c.fillStyle = '#f8f9fa';
      c.strokeStyle = '#6c757d';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(-9, -4, 4.5, 0, Math.PI * 2);
      c.arc(-9, 4, 4.5, 0, Math.PI * 2);
      c.arc(9, -4, 4.5, 0, Math.PI * 2);
      c.arc(9, 4, 4.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillRect(-9, -3.5, 18, 7);
    });
  }
};

SpriteCache.init();

// ============================================================================
// SISTEMA DE SOM SINTETIZADO (COM LIMPEZA DE NÓS DE ÁUDIO)
// ============================================================================
class SoundSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.activeNodes = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    btnSound.innerHTML = this.enabled
      ? '🔊 <span class="btn-label">Som</span>'
      : '🔇 <span class="btn-label">Mudo</span>';
    if (!this.enabled) {
      this.stopMusic();
    } else {
      this.init();
      if (game.state === 'playing') this.startMusic();
    }
  }

  playTone(freq, type, duration, vol = 0.12, slideTo = null) {
    if (!this.enabled || !this.ctx || this.activeNodes > 16) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      }
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      this.activeNodes++;
      osc.onended = () => {
        this.activeNodes = Math.max(0, this.activeNodes - 1);
        osc.disconnect();
        gain.disconnect();
      };

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  }

  jump() {
    this.playTone(280, 'sine', 0.15, 0.13, 580);
  }

  doubleJump() {
    this.playTone(420, 'triangle', 0.16, 0.13, 880);
  }

  throwYarn() {
    this.playTone(520, 'sine', 0.09, 0.09, 260);
  }

  dash() {
    this.playTone(780, 'sawtooth', 0.11, 0.11, 180);
  }

  meow() {
    if (!this.enabled || !this.ctx) return;
    this.playTone(550, 'triangle', 0.13, 0.14, 820);
    setTimeout(() => this.playTone(820, 'triangle', 0.2, 0.13, 480), 115);
  }

  collectFish() {
    this.playTone(660, 'sine', 0.08, 0.11);
    setTimeout(() => this.playTone(990, 'sine', 0.12, 0.11), 65);
  }

  collectPowerup() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => {
      setTimeout(() => this.playTone(n, 'triangle', 0.12, 0.12), i * 65);
    });
  }

  enemyWrap() {
    this.playTone(300, 'square', 0.11, 0.07, 620);
  }

  bounce() {
    this.playTone(220, 'sine', 0.22, 0.16, 760);
  }

  hurt() {
    this.playTone(260, 'sawtooth', 0.2, 0.09, 120);
  }

  bossBark() {
    this.playTone(180, 'sawtooth', 0.16, 0.13, 95);
  }

  victory() {
    const melody = [523, 659, 784, 1046, 784, 1046];
    const times = [0, 120, 240, 360, 520, 660];
    melody.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'triangle', 0.2, 0.14), times[idx]);
    });
  }

  startMusic() {
    this.stopMusic();
    if (!this.enabled) return;
    const happyNotes = [262, 330, 392, 523, 392, 330, 294, 349, 440, 349, 294, 330];
    const bossNotes = [220, 262, 247, 220, 196, 220, 262, 330, 294, 262, 247, 196];
    this.bgmTimer = setInterval(() => {
      if (!this.enabled || game.state !== 'playing') return;
      this.init();
      const seq = game.levelIndex === 2 ? bossNotes : happyNotes;
      const note = seq[this.bgmStep % seq.length];
      this.playTone(note, 'sine', 0.16, 0.03);
      this.bgmStep++;
    }, 280);
  }

  stopMusic() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

const sound = new SoundSystem();

// ============================================================================
// CONTROLES DE TECLADO, TOQUE E CONTROLE DE PC (GAMEPAD API)
// ============================================================================
const hudGamepad = document.getElementById('hud-gamepad');

const kbKeys = {
  left: false,
  right: false,
  jump: false
};

const keys = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  attackPressed: false,
  dashPressed: false
};

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }

  // Se estiver no menu, fim de fase, vitória, game over ou pausa: Espaço ou Enter aciona o botão!
  if (game.state !== 'playing') {
    if (!e.repeat && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      btnStart.click();
    }
    return;
  }

  if (e.code === 'ArrowLeft' || e.code === 'KeyA') kbKeys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') kbKeys.right = true;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    if (!kbKeys.jump) keys.jumpPressed = true;
    kbKeys.jump = true;
  }
  if (e.code === 'KeyZ' || e.code === 'KeyJ' || e.code === 'Enter') {
    keys.attackPressed = true;
  }
  if (e.code === 'KeyX' || e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    keys.dashPressed = true;
  }
  keys.left = kbKeys.left;
  keys.right = kbKeys.right;
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') kbKeys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') kbKeys.right = false;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') kbKeys.jump = false;
  keys.left = kbKeys.left;
  keys.right = kbKeys.right;
});

function bindTouchButton(id, onDown, onUp) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = (e) => {
    e.preventDefault();
    sound.init();
    onDown();
  };
  const end = (e) => {
    e.preventDefault();
    if (onUp) onUp();
  };
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', end);
  el.addEventListener('mouseleave', end);
  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchend', end, { passive: false });
}

bindTouchButton('touch-left', () => { kbKeys.left = true; keys.left = true; }, () => { kbKeys.left = false; keys.left = false; });
bindTouchButton('touch-right', () => { kbKeys.right = true; keys.right = true; }, () => { kbKeys.right = false; keys.right = false; });
bindTouchButton('touch-jump', () => { keys.jumpPressed = true; kbKeys.jump = true; }, () => { kbKeys.jump = false; });
bindTouchButton('touch-yarn', () => { keys.attackPressed = true; });
bindTouchButton('touch-dash', () => { keys.dashPressed = true; });

// Gerenciador de Controle de PC (Xbox, PlayStation, Switch, USB Genérico)
const GamepadManager = {
  connected: false,
  prevJump: false,
  prevAttack: false,
  prevDash: false,
  prevStart: false,
  prevSelect: false,

  setStatus(isConnected) {
    if (this.connected === isConnected) return;
    this.connected = isConnected;
    if (hudGamepad) {
      hudGamepad.className = isConnected ? 'hud-badge gamepad-on' : 'hud-badge gamepad-off';
      hudGamepad.innerHTML = isConnected ? '<span>🎮 Controle OK</span>' : '<span>🎮 Controle</span>';
    }
  },

  vibrate(duration = 90, weak = 0.3, strong = 0.15) {
    if (!navigator.getGamepads) return;
    try {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        const gp = pads[i];
        if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) {
          gp.vibrationActuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration,
            weakMagnitude: weak,
            strongMagnitude: strong
          });
          break;
        }
      }
    } catch (e) {}
  },

  isBtnPressed(gp, idx) {
    const b = gp.buttons[idx];
    if (!b) return false;
    return typeof b === 'object' ? b.pressed || b.value > 0.35 : b === 1.0;
  },

  poll() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let gp = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) {
        gp = pads[i];
        break;
      }
    }

    if (!gp) {
      this.setStatus(false);
      keys.left = kbKeys.left;
      keys.right = kbKeys.right;
      return;
    }

    this.setStatus(true);

    // Analógico Esquerdo (eixo 0) + D-Pad Esquerda (14) / Direita (15)
    const axisX = gp.axes && gp.axes.length > 0 ? gp.axes[0] : 0;
    const dpadLeft = this.isBtnPressed(gp, 14);
    const dpadRight = this.isBtnPressed(gp, 15);

    const padLeft = axisX < -0.25 || dpadLeft;
    const padRight = axisX > 0.25 || dpadRight;

    keys.left = kbKeys.left || padLeft;
    keys.right = kbKeys.right || padRight;

    // Pulo: Botão A/Cruz (0), D-Pad Cima (12) ou LB/L1 (4)
    const jumpNow =
      this.isBtnPressed(gp, 0) ||
      this.isBtnPressed(gp, 12) ||
      this.isBtnPressed(gp, 4);

    // Lançar Novelo: Botão X/Quadrado (2), RB/R1 (5) ou RT/R2 (7)
    const attackNow =
      this.isBtnPressed(gp, 2) ||
      this.isBtnPressed(gp, 5) ||
      this.isBtnPressed(gp, 7);

    // Super Giro Felino: Botão B/Bolinha (1), Y/Triângulo (3) ou LT/L2 (6)
    const dashNow =
      this.isBtnPressed(gp, 1) ||
      this.isBtnPressed(gp, 3) ||
      this.isBtnPressed(gp, 6);

    // Start/Options (9) e Select/Back (8)
    const startNow = this.isBtnPressed(gp, 9);
    const selectNow = this.isBtnPressed(gp, 8);

    // Se estiver no Menu Inicial, Fim de Fase, Vitória ou Game Over, Botão A ou Start avança!
    if (game.state !== 'playing') {
      if ((startNow && !this.prevStart) || ( this.isBtnPressed(gp, 0) && !this.prevJump )) {
        btnStart.click();
      }
    } else {
      // Durante o jogo: borda de subida dos botões de ação
      if (jumpNow && !this.prevJump) {
        sound.init();
        keys.jumpPressed = true;
      }
      if (attackNow && !this.prevAttack) {
        sound.init();
        keys.attackPressed = true;
      }
      if (dashNow && !this.prevDash) {
        sound.init();
        keys.dashPressed = true;
      }
      if (startNow && !this.prevStart) {
        btnHelp.click();
      }
      if (selectNow && !this.prevSelect) {
        btnRestart.click();
      }
    }

    this.prevJump = jumpNow;
    this.prevAttack = attackNow;
    this.prevDash = dashNow;
    this.prevStart = startNow;
    this.prevSelect = selectNow;
  }
};

window.addEventListener('gamepadconnected', () => GamepadManager.setStatus(true));
window.addEventListener('gamepaddisconnected', () => GamepadManager.setStatus(false));

// ============================================================================
// PARTÍCULAS VETORIAIS ULTRARRÁPIDAS (SEM FILLTEXT DE EMOJI)
// ============================================================================
class Particle {
  constructor(x, y, vx, vy, color, size, life, shape = 'circle') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.shape = shape;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.15;
    this.life--;
  }

  draw(ctx, camX) {
    const sx = this.x - camX;
    if (sx < -20 || sx > canvas.width + 20) return;

    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    const sy = this.y;
    const r = this.size;

    if (this.shape === 'heart') {
      ctx.beginPath();
      ctx.arc(sx - r * 0.45, sy - r * 0.3, r * 0.55, 0, Math.PI * 2);
      ctx.arc(sx + r * 0.45, sy - r * 0.3, r * 0.55, 0, Math.PI * 2);
      ctx.moveTo(sx - r, sy - r * 0.1);
      ctx.lineTo(sx, sy + r);
      ctx.lineTo(sx + r, sy - r * 0.1);
      ctx.fill();
    } else if (this.shape === 'star') {
      ctx.beginPath();
      ctx.moveTo(sx, sy - r * 1.3);
      ctx.lineTo(sx + r * 0.4, sy - r * 0.4);
      ctx.lineTo(sx + r * 1.3, sy);
      ctx.lineTo(sx + r * 0.4, sy + r * 0.4);
      ctx.lineTo(sx, sy + r * 1.3);
      ctx.lineTo(sx - r * 0.4, sy + r * 0.4);
      ctx.lineTo(sx - r * 1.3, sy);
      ctx.lineTo(sx - r * 0.4, sy - r * 0.4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

class FloatingText {
  constructor(x, y, text, color = '#ffb703') {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 50;
  }

  update() {
    this.y -= 1.1;
    this.life--;
  }

  draw(ctx, camX) {
    const sx = this.x - camX;
    if (sx < -150 || sx > canvas.width + 50) return;

    ctx.globalAlpha = Math.max(0, this.life / 50);
    ctx.font = 'bold 17px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.text, sx + 1.5, this.y + 1.5);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, sx, this.y);
    ctx.globalAlpha = 1;
  }
}

// ============================================================================
// NOVELO DE LÃ (PROJETIL DA GATA CHELLY)
// ============================================================================
const YARN_COLORS = ['#ff4d6d', '#06d6a0', '#ffb703', '#8338ec', '#3a86ff'];

class YarnBall {
  constructor(x, y, vx, vy, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = 12;
    this.color = color || YARN_COLORS[Math.floor(Math.random() * YARN_COLORS.length)];
    this.angle = 0;
    this.bounces = 0;
    this.life = 115;
    this.prevX = x;
    this.prevY = y;
  }

  update(platforms) {
    this.prevX = this.x;
    this.prevY = this.y;

    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.28;
    this.angle += this.vx * 0.06;
    this.life--;

    // Quica nas plataformas
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (
        this.x + this.r > p.x &&
        this.x - this.r < p.x + p.w &&
        this.y + this.r > p.y &&
        this.y - this.r < p.y + p.h
      ) {
        if (this.vy > 0 && this.y < p.y + 12) {
          this.y = p.y - this.r;
          this.vy = -5.8;
          this.bounces++;
          if (this.bounces > 3) this.life = 0;
        } else {
          this.vx = -this.vx;
          this.bounces++;
        }
      }
    }
  }

  draw(ctx, camX) {
    const sx = this.x - camX;
    if (sx < -30 || sx > canvas.width + 30) return;

    // Fio de lã curto atrás do novelo
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(this.prevX - this.vx * 1.5 - camX, this.prevY - this.vy * 1.5);
    ctx.lineTo(sx, this.y);
    ctx.stroke();

    // Bola de lã
    ctx.save();
    ctx.translate(sx, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Linhas internas do novelo
    ctx.beginPath();
    ctx.arc(-2, -2, this.r * 0.65, -0.4, 1.8);
    ctx.stroke();

    ctx.restore();
  }
}

// ============================================================================
// PROTAGONISTA: GATA CHELLY (PELAGEM CINZA FOFA)
// ============================================================================
class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 44;
    this.h = 46;
    this.vx = 0;
    this.vy = 0;
    this.dir = 1;
    this.onGround = false;
    this.jumpsLeft = 2;
    this.coyoteTimer = 0;
    this.attackCooldown = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.invulnTimer = 0;
    this.rainbowTimer = 0;
    this.animFrame = 0;
    this.yarnColorIndex = 0;
  }

  update(platforms, springs) {
    this.animFrame += 0.16;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.dashCooldown > 0) this.dashCooldown--;
    if (this.invulnTimer > 0) this.invulnTimer--;
    if (this.rainbowTimer > 0) this.rainbowTimer--;

    // Ataque de Garras (estilo Wolverine com marcas brancas de corte na frente!)
    if (keys.dashPressed && this.dashCooldown === 0 && this.dashTimer === 0) {
      this.dashTimer = 14;
      this.dashCooldown = 28;
      this.vx = this.dir * 8.0;
      sound.dash();
      GamepadManager.vibrate(70, 0.25, 0.15);
    }
    keys.dashPressed = false;

    if (this.dashTimer > 0) {
      this.dashTimer--;
      // Impulso curto na primeira metade do golpe de garras
      if (this.dashTimer > 7) {
        this.vx = this.dir * 7.5;
      } else {
        this.vx *= 0.85;
      }
      this.vy += 0.35;
      if (this.vy > 10) this.vy = 10;
    } else {
      const accel = this.onGround ? 1.1 : 0.75;
      const maxSpeed = this.rainbowTimer > 0 ? 6.8 : 5.5;

      if (keys.left) {
        this.vx = Math.max(this.vx - accel, -maxSpeed);
        this.dir = -1;
      } else if (keys.right) {
        this.vx = Math.min(this.vx + accel, maxSpeed);
        this.dir = 1;
      } else {
        this.vx *= this.onGround ? 0.78 : 0.9;
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
      }

      // Gravidade
      this.vy += 0.56;
      if (this.vy > 13) this.vy = 13;
    }

    // Pulo e Pulo Duplo
    if (this.onGround) {
      this.coyoteTimer = 7;
      this.jumpsLeft = 2;
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer--;
    }

    if (keys.jumpPressed) {
      if (this.coyoteTimer > 0 || this.jumpsLeft > 0) {
        const isFirstJump = this.onGround || this.coyoteTimer > 0;
        this.vy = isFirstJump ? -11.8 : -10.6;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.jumpsLeft = isFirstJump ? 1 : 0;

        if (isFirstJump) {
          sound.jump();
          game.spawnParticles(this.x + this.w / 2, this.y + this.h, '#e2e8f0', 5);
        } else {
          sound.doubleJump();
          game.spawnParticles(this.x + this.w / 2, this.y + this.h, '#ffd166', 6, 'star');
        }
      }
      keys.jumpPressed = false;
    }

    // Atirar Novelo de Lã
    if (keys.attackPressed && this.attackCooldown === 0) {
      this.shootYarn();
      this.attackCooldown = 16;
    }
    keys.attackPressed = false;

    // Movimento Horizontal + Colisão
    this.x += this.vx;
    if (this.x < 0) {
      this.x = 0;
      this.vx = 0;
    }
    if (this.x + this.w > game.levelWidth) {
      this.x = game.levelWidth - this.w;
      this.vx = 0;
    }

    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (!p.passThrough && this.intersects(p)) {
        if (this.vx > 0) {
          this.x = p.x - this.w;
          this.vx = 0;
        } else if (this.vx < 0) {
          this.x = p.x + p.w;
          this.vx = 0;
        }
      }
    }

    // Movimento Vertical + Colisão
    const prevBottom = this.y + this.h;
    this.y += this.vy;
    this.onGround = false;

    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (this.intersects(p)) {
        if (p.passThrough) {
          if (this.vy >= 0 && prevBottom <= p.y + 12) {
            this.y = p.y - this.h;
            this.vy = 0;
            this.onGround = true;
            if (p.vx) this.x += p.vx;
          }
        } else {
          if (this.vy >= 0 && prevBottom <= p.y + 16) {
            this.y = p.y - this.h;
            this.vy = 0;
            this.onGround = true;
            if (p.vx) this.x += p.vx;
          } else if (this.vy < 0) {
            this.y = p.y + p.h;
            this.vy = 0;
          }
        }
      }
    }

    // Cogumelos Trampolim
    for (let i = 0; i < springs.length; i++) {
      const s = springs[i];
      if (
        this.x + this.w > s.x &&
        this.x < s.x + s.w &&
        this.y + this.h > s.y &&
        this.y < s.y + s.h
      ) {
        this.vy = -16.2;
        this.onGround = false;
        this.jumpsLeft = 1;
        s.bounceAnim = 12;
        sound.bounce();
        game.spawnParticles(s.x + s.w / 2, s.y, '#ffbe0b', 7, 'star');
      }
    }

    // Queda em buraco
    if (this.y > canvas.height + 100) {
      this.takeDamage(true);
    }
  }

  shootYarn() {
    sound.throwYarn();
    const color = YARN_COLORS[this.yarnColorIndex % YARN_COLORS.length];
    this.yarnColorIndex++;
    const spawnX = this.dir === 1 ? this.x + this.w + 4 : this.x - 4;
    const spawnY = this.y + 22;

    game.yarns.push(new YarnBall(spawnX, spawnY, this.dir * 9.5, -2.6, color));

    // Super Novelo Arco-Íris lança 3 novelos de uma vez!
    if (this.rainbowTimer > 0) {
      game.yarns.push(new YarnBall(spawnX, spawnY, this.dir * 8.5, -5.2, '#ffbe0b'));
      game.yarns.push(new YarnBall(spawnX, spawnY, this.dir * 10.2, -0.5, '#3a86ff'));
    }
  }

  takeDamage(fellInPit = false) {
    if (this.invulnTimer > 0 && !fellInPit) return;
    if (this.dashTimer > 0 && !fellInPit) return;

    game.lives--;
    sound.hurt();
    GamepadManager.vibrate(180, 0.6, 0.5);
    this.invulnTimer = 80;
    game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#ff4d6d', 10);
    game.updateHUD();

    if (game.lives <= 0) {
      game.triggerGameOver();
    } else if (fellInPit) {
      this.x = game.checkpointX;
      this.y = game.checkpointY;
      this.vx = 0;
      this.vy = 0;
    } else {
      this.vy = -7.5;
      this.vx = -this.dir * 5;
    }
  }

  intersects(rect) {
    return (
      this.x < rect.x + rect.w &&
      this.x + this.w > rect.x &&
      this.y < rect.y + rect.h &&
      this.y + this.h > rect.y
    );
  }

  getClawBox() {
    return {
      x: this.dir === 1 ? this.x + this.w - 8 : this.x - 58,
      y: this.y - 10,
      w: 66,
      h: this.h + 18
    };
  }

  draw(ctx, camX) {
    if (this.invulnTimer > 0 && ((this.invulnTimer >> 2) & 1) === 1) return;

    const cx = this.x - camX + this.w / 2;
    const cy = this.y + this.h / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this.dir, 1);

    // Aura arco-íris do Super Novelo
    if (this.rainbowTimer > 0) {
      ctx.strokeStyle = '#ffbe0b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rabinho cinza animado da Chelly
    const tailWag = Math.sin(this.animFrame * 1.5) * 0.35;
    ctx.strokeStyle = '#8d99ae';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, 10);
    ctx.quadraticCurveTo(-28, 2 + tailWag * 18, -24, -14 + tailWag * 10);
    ctx.stroke();

    // Patinhas cinza-claras animadas
    const legOffset = Math.abs(this.vx) > 0.3 && this.onGround ? Math.sin(this.animFrame * 2.5) * 5 : 0;
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.ellipse(-8 + legOffset, 19, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(9 - legOffset, 19, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Corpo da gatinha Chelly (Pelagem Cinza Prateada)
    ctx.fillStyle = '#9aa5b1';
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-16, -2, 30, 20, 10);
    ctx.fill();
    ctx.stroke();

    // Listrinhas cinza-escuras nas costas
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.ellipse(-8, 2, 2.5, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(-2, 2, 2.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Barriguinha cinza bem clarinho
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.ellipse(2, 8, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Patinha dianteira estendida durante o Ataque de Garras
    if (this.dashTimer > 0) {
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#4a5568';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(18, 3, 8, 5, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Cabeça cinza da Chelly
    ctx.fillStyle = '#9aa5b1';
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(2, -10, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Orelhas pontudas cinzas
    ctx.fillStyle = '#9aa5b1';
    ctx.beginPath();
    ctx.moveTo(-10, -18);
    ctx.lineTo(-4, -30);
    ctx.lineTo(2, -21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(4, -21);
    ctx.lineTo(12, -30);
    ctx.lineTo(15, -17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Interior rosa das orelhinhas
    ctx.fillStyle = '#ff8fab';
    ctx.beginPath();
    ctx.moveTo(-7, -19);
    ctx.lineTo(-4, -26);
    ctx.lineTo(0, -21);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(6, -21);
    ctx.lineTo(11, -26);
    ctx.lineTo(13, -18);
    ctx.closePath();
    ctx.fill();

    // Olhinhos expressivos (verdes/azuis brilhantes)
    const blink = Math.floor(this.animFrame * 2) % 45 === 0;
    ctx.fillStyle = '#1d3557';
    if (blink) {
      ctx.strokeStyle = '#1d3557';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(5, -11);
      ctx.lineTo(11, -11);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(8, -11, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(9, -12.2, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Focinho rosa e bigodinhos
    ctx.fillStyle = '#ff758f';
    ctx.beginPath();
    ctx.arc(14, -8, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(11, -6);
    ctx.lineTo(19, -4);
    ctx.moveTo(11, -8);
    ctx.lineTo(20, -8);
    ctx.stroke();

    // EFEITO DE ATAQUE DE GARRAS ESTILO WOLVERINE (3 Marcas Brancas de Corte na Frente!)
    if (this.dashTimer > 0) {
      const progress = 1 - this.dashTimer / 14;
      const swipeY = progress * 8;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (this.dashTimer / 14) * 1.4);

      const offsets = [-16, -3, 10];
      for (let i = 0; i < 3; i++) {
        const oy = offsets[i] + swipeY;
        const startX = 18 + i * 2;
        const endX = 64 - i * 3;

        // Lâmina/marca branca curvada afiada nas duas pontas
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(startX, oy - 9);
        ctx.quadraticCurveTo(startX + 24, oy - 3, endX, oy + 9);
        ctx.quadraticCurveTo(startX + 18, oy + 3, startX, oy - 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Faíscas brancas de corte
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(56, -12 + swipeY);
      ctx.lineTo(68, -16 + swipeY);
      ctx.moveTo(60, 4 + swipeY);
      ctx.lineTo(72, 6 + swipeY);
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();
  }
}

// ============================================================================
// FILHOTES DA CHELLY EM GAIOLAS (OBJETIVO DE RESGATE)
// ============================================================================
class KittenCage {
  constructor(x, y, name, furColor, lockedByBoss = false) {
    this.x = x;
    this.y = y;
    this.w = 48;
    this.h = 48;
    this.name = name;
    this.furColor = furColor;
    this.rescued = false;
    this.lockedByBoss = lockedByBoss;
    this.anim = Math.random() * 10;
    this.followX = x;
    this.followY = y;
  }

  update(player, index) {
    this.anim += 0.1;

    if (!this.rescued) {
      if (!this.lockedByBoss && player.intersects(this)) {
        this.rescue();
      }
    } else {
      // Filhote resgatado segue a mamãe Chelly!
      const targetX = player.x - player.dir * (36 + index * 28);
      const targetY = player.y + 18 + Math.sin(this.anim * 2 + index) * 4;
      this.followX += (targetX - this.followX) * 0.14;
      this.followY += (targetY - this.followY) * 0.18;
    }
  }

  rescue() {
    this.rescued = true;
    this.followX = this.x;
    this.followY = this.y;
    game.rescuedCount++;
    game.score += 100;
    game.checkpointX = this.x;
    game.checkpointY = this.y - 10;
    sound.meow();
    GamepadManager.vibrate(140, 0.45, 0.25);
    game.spawnParticles(this.x + 24, this.y + 24, '#ff4d6d', 12, 'heart');
    game.texts.push(new FloatingText(this.x, this.y - 10, `${this.name} Salvo!`, '#ff4d6d'));
    game.updateHUD();
  }

  draw(ctx, camX) {
    if (!this.rescued) {
      const sx = this.x - camX;
      if (sx < -80 || sx > canvas.width + 80) return;
      const sy = this.y;

      // Sombra/Fundo da gaiola
      ctx.fillStyle = 'rgba(20, 33, 61, 0.35)';
      ctx.fillRect(sx + 4, sy + 6, this.w - 8, this.h - 6);

      // Gatinho filhote lá dentro
      this.drawKitten(ctx, sx + 24, sy + 32 + Math.sin(this.anim * 1.5) * 2, 1);

      // Grades da gaiola
      ctx.strokeStyle = this.lockedByBoss ? '#ffb703' : '#adb5bd';
      ctx.lineWidth = 4;
      ctx.strokeRect(sx + 4, sy + 6, this.w - 8, this.h - 6);

      ctx.beginPath();
      for (let gx = sx + 14; gx < sx + this.w - 6; gx += 10) {
        ctx.moveTo(gx, sy + 6);
        ctx.lineTo(gx, sy + this.h);
      }
      ctx.stroke();

      // Balãozinho pedindo ajuda
      const bubbleY = sy - 12 + Math.sin(this.anim) * 3;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(sx - 6, bubbleY - 16, 60, 20, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.fillStyle = '#d90429';
      ctx.fillText(this.lockedByBoss ? 'Socorro!' : 'Miau!', sx + 2, bubbleY - 2);
    } else {
      const fx = this.followX - camX + 14;
      if (fx < -50 || fx > canvas.width + 50) return;
      this.drawKitten(ctx, fx, this.followY + 12, game.player.dir);
    }
  }

  drawKitten(ctx, cx, cy, dir) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(dir, 1);

    ctx.fillStyle = this.furColor;
    ctx.strokeStyle = '#4a4e69';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.ellipse(0, 4, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(3, -5, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Orelhinhas
    ctx.beginPath();
    ctx.moveTo(-4, -10);
    ctx.lineTo(-1, -17);
    ctx.lineTo(3, -12);
    ctx.moveTo(5, -12);
    ctx.lineTo(9, -17);
    ctx.lineTo(11, -10);
    ctx.fill();
    ctx.stroke();

    // Olhinhos
    ctx.fillStyle = '#1d3557';
    ctx.beginPath();
    ctx.arc(6, -6, 2, 0, Math.PI * 2);
    ctx.fill();

    // Focinho rosa
    ctx.fillStyle = '#ff758f';
    ctx.beginPath();
    ctx.arc(10, -4, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ============================================================================
// VILÕES ANIMAIS (BULLDOG, GUAXINIM, SAPO, CORVO)
// ============================================================================
class AnimalEnemy {
  constructor(x, y, type, minX, maxX) {
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.type = type; // 'bulldog' | 'raccoon' | 'frog' | 'crow'
    this.w = 44;
    this.h = 42;
    this.minX = minX;
    this.maxX = maxX;
    this.dir = 1;
    this.vx = type === 'raccoon' ? 2.6 : type === 'crow' ? 2.2 : 1.5;
    this.vy = 0;
    this.anim = Math.random() * 10;
    this.wrapped = false;
    this.wrapColor = '#ff4d6d';
    this.jumpCooldown = 60;
  }

  update() {
    this.anim += 0.12;

    if (this.wrapped) {
      this.y += this.vy;
      this.vy += 0.45;
      this.x += this.vx;
      return;
    }

    this.x += this.vx * this.dir;
    if (this.x <= this.minX) {
      this.x = this.minX;
      this.dir = 1;
    } else if (this.x + this.w >= this.maxX) {
      this.x = this.maxX - this.w;
      this.dir = -1;
    }

    if (this.type === 'crow') {
      this.y = this.baseY + Math.sin(this.anim * 0.9) * 26;
    } else if (this.type === 'frog') {
      this.jumpCooldown--;
      if (this.jumpCooldown <= 0 && this.y >= this.baseY) {
        this.vy = -9.5;
        this.jumpCooldown = 85;
      }
      this.y += this.vy;
      this.vy += 0.45;
      if (this.y > this.baseY) {
        this.y = this.baseY;
        this.vy = 0;
      }
    }
  }

  wrapInYarn(color) {
    if (this.wrapped) return;
    this.wrapped = true;
    this.wrapColor = color || '#ff4d6d';
    this.vy = -7.5;
    this.vx = (Math.random() > 0.5 ? 1 : -1) * 2.5;
    game.score += 50;
    sound.enemyWrap();
    game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, this.wrapColor, 8, 'star');
    game.texts.push(new FloatingText(this.x, this.y, 'Embrulhado! +50', this.wrapColor));
    game.updateHUD();
  }

  draw(ctx, camX) {
    const cx = this.x - camX + this.w / 2;
    if (cx < -60 || cx > canvas.width + 60) return;
    const cy = this.y + this.h / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this.dir, 1);

    if (this.type === 'bulldog') {
      ctx.fillStyle = '#a9714b';
      ctx.strokeStyle = '#582f0e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-18, -12, 36, 30, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#582f0e';
      ctx.beginPath();
      ctx.ellipse(-12, -10, 5, 9, 0.3, 0, Math.PI * 2);
      ctx.ellipse(12, -10, 5, 9, -0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e6ccb2';
      ctx.beginPath();
      ctx.ellipse(6, 4, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(2, 0, 4, 5);
      ctx.fillRect(9, 0, 4, 5);

      ctx.fillStyle = '#1d3557';
      ctx.beginPath();
      ctx.arc(6, -5, 3, 0, Math.PI * 2);
      ctx.arc(14, -2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'raccoon') {
      ctx.fillStyle = '#6c757d';
      ctx.strokeStyle = '#343a40';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-16, -10, 32, 28, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#212529';
      ctx.beginPath();
      ctx.roundRect(-4, -8, 20, 9, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(8, -4, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'frog') {
      ctx.fillStyle = '#52b788';
      ctx.strokeStyle = '#1b4332';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 4, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-6, -10, 6, 0, Math.PI * 2);
      ctx.arc(6, -10, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1b4332';
      ctx.beginPath();
      ctx.arc(-4, -10, 2.5, 0, Math.PI * 2);
      ctx.arc(8, -10, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'crow') {
      const wingY = Math.sin(this.anim * 3) * 8;
      ctx.fillStyle = '#480ca8';
      ctx.strokeStyle = '#240046';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#7209b7';
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-12, -12 + wingY);
      ctx.lineTo(6, -2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.moveTo(14, -4);
      ctx.lineTo(26, 0);
      ctx.lineTo(14, 5);
      ctx.closePath();
      ctx.fill();
    }

    if (this.wrapped) {
      ctx.strokeStyle = this.wrapColor;
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = -12; i <= 12; i += 8) {
        ctx.moveTo(-18, i);
        ctx.lineTo(18, i + 4);
      }
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ============================================================================
// CHEFÃO FINAL: BARÃO DOBERMANN
// ============================================================================
class BossDobermann {
  constructor(x, y, minX, maxX) {
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.w = 78;
    this.h = 84;
    this.minX = minX;
    this.maxX = maxX;
    this.maxHp = 10;
    this.hp = 10;
    this.dir = -1;
    this.vx = 0;
    this.vy = 0;
    this.state = 'patrol';
    this.stateTimer = 90;
    this.hurtTimer = 0;
    this.anim = 0;
    this.projectiles = [];
  }

  update(player) {
    this.anim += 0.14;
    if (this.hurtTimer > 0) this.hurtTimer--;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (
        player.x < p.x + p.r &&
        player.x + player.w > p.x - p.r &&
        player.y < p.y + p.r &&
        player.y + player.h > p.y - p.r
      ) {
        player.takeDamage();
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.life <= 0) this.projectiles.splice(i, 1);
    }

    if (this.state === 'defeated') return;

    this.stateTimer--;

    if (this.state === 'patrol') {
      this.dir = player.x < this.x ? -1 : 1;
      this.x += this.dir * 2.2;

      if (this.stateTimer % 55 === 0) {
        sound.bossBark();
        this.projectiles.push({
          x: this.dir === 1 ? this.x + this.w : this.x,
          y: this.y + 48,
          vx: this.dir * 6.2,
          vy: 0,
          r: 14,
          life: 110
        });
        game.texts.push(new FloatingText(this.x, this.y - 12, 'AUUU!', '#ff4d6d'));
      }

      if (this.stateTimer <= 0) {
        this.state = Math.random() > 0.4 ? 'charge' : 'jump';
        this.stateTimer = this.state === 'charge' ? 85 : 70;
        if (this.state === 'jump') {
          this.vy = -12.5;
          this.vx = this.dir * 4.5;
        }
      }
    } else if (this.state === 'charge') {
      this.x += this.dir * 7.4;
      if (this.x <= this.minX) {
        this.x = this.minX;
        this.becomeDizzy();
      } else if (this.x + this.w >= this.maxX) {
        this.x = this.maxX - this.w;
        this.becomeDizzy();
      }
    } else if (this.state === 'jump') {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.5;
      if (this.x < this.minX) this.x = this.minX;
      if (this.x + this.w > this.maxX) this.x = this.maxX - this.w;
      if (this.y >= this.baseY) {
        this.y = this.baseY;
        this.vy = 0;
        this.state = 'patrol';
        this.stateTimer = 95;
      }
    } else if (this.state === 'dizzy') {
      if (this.stateTimer <= 0) {
        this.state = 'patrol';
        this.stateTimer = 100;
      }
    }
  }

  becomeDizzy() {
    this.state = 'dizzy';
    this.stateTimer = 110;
    sound.enemyWrap();
    game.spawnParticles(this.x + this.w / 2, this.y + 20, '#ffd166', 8, 'star');
    game.texts.push(new FloatingText(this.x, this.y - 15, 'Tonto! Agora!', '#ffb703'));
  }

  takeHit(dmg = 1) {
    if (this.state === 'defeated' || this.hurtTimer > 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.hurtTimer = 18;
    sound.enemyWrap();
    game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#ff4d6d', 8, 'star');

    bossBarFill.style.width = `${(this.hp / this.maxHp) * 100}%`;

    if (this.hp <= 0) {
      this.state = 'defeated';
      this.y = this.baseY;
      game.score += 500;
      sound.victory();
      GamepadManager.vibrate(250, 0.7, 0.5);
      game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#ffd166', 18, 'star');
      game.texts.push(
        new FloatingText(this.x - 30, this.y - 20, 'Barão Dobermann Derrotado!', '#06d6a0')
      );
      game.kittens.forEach((k) => {
        if (k.lockedByBoss) {
          k.lockedByBoss = false;
          game.spawnParticles(k.x + 24, k.y + 24, '#ffd166', 10, 'star');
        }
      });
      game.updateHUD();
    }
  }

  draw(ctx, camX) {
    // Desenha ossinhos usando SpriteCache (sem emoji lento)
    const boneSprite = SpriteCache.sprites.bone;
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      ctx.drawImage(boneSprite, p.x - camX - 17, p.y - 12);
    }

    if (this.hurtTimer > 0 && ((this.hurtTimer >> 1) & 1) === 1) return;

    const cx = this.x - camX + this.w / 2;
    const cy = this.y + this.h / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this.dir, 1);

    // Pose especial de DERROTADO: deitado no chão, amarrado em lã, olhos em X, língua de fora e bandeira branca!
    if (this.state === 'defeated') {
      // Capa vermelha espalhada no chão
      ctx.fillStyle = '#d90429';
      ctx.beginPath();
      ctx.ellipse(-10, 34, 38, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Corpo deitado na horizontal no chão
      ctx.fillStyle = '#2b2d42';
      ctx.strokeStyle = '#14213d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-34, 10, 56, 28, 12);
      ctx.fill();
      ctx.stroke();

      // Cordas de lã enroladas no corpo derrotado
      ctx.strokeStyle = '#ff8fab';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-22, 10);
      ctx.lineTo(-18, 38);
      ctx.moveTo(-8, 10);
      ctx.lineTo(-4, 38);
      ctx.moveTo(6, 10);
      ctx.lineTo(10, 38);
      ctx.stroke();

      // Cabeça caída no chão
      ctx.fillStyle = '#2b2d42';
      ctx.beginPath();
      ctx.roundRect(12, 6, 28, 24, 8);
      ctx.fill();
      ctx.stroke();

      // Focinho caramelo encostado no chão
      ctx.fillStyle = '#bc6c25';
      ctx.beginPath();
      ctx.roundRect(30, 14, 20, 13, 5);
      ctx.fill();

      // Língua rosa caída para fora (cansado/derrotado)
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.roundRect(38, 25, 8, 12, 4);
      ctx.fill();

      // Orelhas caídas para trás
      ctx.fillStyle = '#2b2d42';
      ctx.beginPath();
      ctx.ellipse(14, 6, 9, 4, -0.4, 0, Math.PI * 2);
      ctx.fill();

      // Olho em formato de "X" (nocauteado de desenho animado)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(24, 12);
      ctx.lineTo(31, 19);
      ctx.moveTo(31, 12);
      ctx.lineTo(24, 19);
      ctx.stroke();

      // Bandeirinha Branca de Rendição abanando
      const wave = Math.sin(this.anim * 1.5) * 3;
      ctx.strokeStyle = '#adb5bd';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-18, 10);
      ctx.lineTo(-18, -28);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#6c757d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-18, -28);
      ctx.quadraticCurveTo(-6, -24 + wave, 6, -26);
      ctx.lineTo(6, -12);
      ctx.quadraticCurveTo(-6, -10 + wave, -18, -14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Estrelinhas de tontura girando acima da cabeça
      const starOffset = Math.cos(this.anim * 2) * 14;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(26 + starOffset, -8, 4.5, 0, Math.PI * 2);
      ctx.arc(26 - starOffset, -12, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      return;
    }

    // Capa vermelha de "Barão" (em pé)
    ctx.fillStyle = '#d90429';
    ctx.beginPath();
    ctx.moveTo(-10, -18);
    ctx.quadraticCurveTo(-42, 5 + Math.sin(this.anim * 2) * 6, -34, 34);
    ctx.lineTo(0, 26);
    ctx.closePath();
    ctx.fill();

    // Corpo esguio do Dobermann
    ctx.fillStyle = '#2b2d42';
    ctx.strokeStyle = '#14213d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-24, -14, 48, 46, 14);
    ctx.fill();
    ctx.stroke();

    // Peito caramelo
    ctx.fillStyle = '#bc6c25';
    ctx.beginPath();
    ctx.ellipse(12, 8, 10, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Coleira dourada
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-12, -14);
    ctx.lineTo(20, -14);
    ctx.stroke();

    // Cabeça e focinho longo do Dobermann
    ctx.fillStyle = '#2b2d42';
    ctx.beginPath();
    ctx.roundRect(-6, -38, 30, 26, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#bc6c25';
    ctx.beginPath();
    ctx.roundRect(12, -30, 24, 14, 6);
    ctx.fill();

    // Orelhas pontudas de Dobermann
    ctx.fillStyle = '#2b2d42';
    ctx.beginPath();
    ctx.moveTo(-4, -36);
    ctx.lineTo(2, -54);
    ctx.lineTo(9, -36);
    ctx.moveTo(10, -36);
    ctx.lineTo(18, -54);
    ctx.lineTo(22, -36);
    ctx.fill();

    // Olhos
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(14, -29, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.arc(15, -29, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Estrelinhas girando quando tonto (vetorial rápido)
    if (this.state === 'dizzy') {
      ctx.fillStyle = '#ffd166';
      const starX = Math.cos(this.anim * 2) * 14;
      ctx.beginPath();
      ctx.arc(starX, -58, 5, 0, Math.PI * 2);
      ctx.arc(-starX, -62, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ============================================================================
// DEFINIÇÃO DAS 3 FASES DO JOGO
// ============================================================================
const LEVELS = [
  {
    name: 'Fase 1: Jardim Ensolarado 🌻',
    skyTop: '#48cae4',
    skyBottom: '#caf0f8',
    groundColor: '#52b788',
    dirtColor: '#b07d62',
    width: 2400,
    platforms: [
      { x: 0, y: 500, w: 750, h: 90 },
      { x: 830, y: 500, w: 680, h: 90 },
      { x: 1590, y: 500, w: 810, h: 90 },
      { x: 240, y: 390, w: 160, h: 24, passThrough: true },
      { x: 460, y: 300, w: 180, h: 24, passThrough: true },
      { x: 920, y: 380, w: 170, h: 24, passThrough: true },
      { x: 1150, y: 280, w: 200, h: 24, passThrough: true },
      { x: 1420, y: 370, w: 140, h: 24, passThrough: true },
      { x: 1720, y: 380, w: 190, h: 24, passThrough: true },
      { x: 1960, y: 285, w: 200, h: 24, passThrough: true }
    ],
    springs: [
      { x: 670, y: 472, w: 44, h: 28, bounceAnim: 0 },
      { x: 1650, y: 472, w: 44, h: 28, bounceAnim: 0 }
    ],
    kittens: [
      { x: 520, y: 252, name: 'Mingau', color: '#ffffff' },
      { x: 2030, y: 237, name: 'Bolinha', color: '#ff9f1c' }
    ],
    enemies: [
      { x: 350, y: 458, type: 'bulldog', minX: 220, maxX: 640 },
      { x: 980, y: 458, type: 'frog', minX: 860, maxX: 1380 },
      { x: 1180, y: 238, type: 'raccoon', minX: 1150, maxX: 1350 },
      { x: 1750, y: 458, type: 'bulldog', minX: 1620, maxX: 2100 },
      { x: 1500, y: 220, type: 'crow', minX: 1320, maxX: 1820 }
    ],
    items: [
      { x: 290, y: 350, type: 'fish' },
      { x: 340, y: 350, type: 'fish' },
      { x: 785, y: 340, type: 'fish' },
      { x: 990, y: 340, type: 'yarn_power' },
      { x: 1220, y: 240, type: 'fish' },
      { x: 1270, y: 240, type: 'fish' },
      { x: 1800, y: 340, type: 'milk' },
      { x: 1990, y: 245, type: 'fish' }
    ],
    goalX: 2260,
    goalY: 420
  },
  {
    name: 'Fase 2: Floresta dos Cogumelos 🍄',
    skyTop: '#7209b7',
    skyBottom: '#f72585',
    groundColor: '#38b000',
    dirtColor: '#7f4f24',
    width: 2600,
    platforms: [
      { x: 0, y: 500, w: 560, h: 90 },
      { x: 660, y: 500, w: 540, h: 90 },
      { x: 1310, y: 500, w: 520, h: 90 },
      { x: 1940, y: 500, w: 660, h: 90 },
      { x: 220, y: 380, w: 160, h: 24, passThrough: true },
      { x: 430, y: 270, w: 180, h: 24, passThrough: true },
      { x: 740, y: 360, w: 170, h: 24, passThrough: true },
      { x: 960, y: 250, w: 210, h: 24, passThrough: true },
      { x: 1400, y: 370, w: 180, h: 24, passThrough: true },
      { x: 1650, y: 260, w: 200, h: 24, passThrough: true },
      { x: 2020, y: 350, w: 180, h: 24, passThrough: true },
      { x: 2220, y: 245, w: 180, h: 24, passThrough: true }
    ],
    springs: [
      { x: 500, y: 472, w: 44, h: 28, bounceAnim: 0 },
      { x: 1130, y: 472, w: 44, h: 28, bounceAnim: 0 },
      { x: 1760, y: 472, w: 44, h: 28, bounceAnim: 0 }
    ],
    kittens: [
      { x: 1035, y: 202, name: 'Pipoca', color: '#ffd166' },
      { x: 2280, y: 197, name: 'Frajola', color: '#adb5bd' }
    ],
    enemies: [
      { x: 280, y: 458, type: 'raccoon', minX: 160, maxX: 480 },
      { x: 750, y: 458, type: 'frog', minX: 680, maxX: 1100 },
      { x: 880, y: 190, type: 'crow', minX: 700, maxX: 1200 },
      { x: 1420, y: 458, type: 'bulldog', minX: 1330, maxX: 1740 },
      { x: 1680, y: 218, type: 'raccoon', minX: 1650, maxX: 1850 },
      { x: 2050, y: 458, type: 'frog', minX: 1960, maxX: 2380 },
      { x: 2100, y: 180, type: 'crow', minX: 1950, maxX: 2420 }
    ],
    items: [
      { x: 280, y: 340, type: 'fish' },
      { x: 490, y: 230, type: 'yarn_power' },
      { x: 800, y: 320, type: 'fish' },
      { x: 1470, y: 330, type: 'milk' },
      { x: 1720, y: 220, type: 'fish' },
      { x: 2090, y: 310, type: 'yarn_power' },
      { x: 2150, y: 310, type: 'fish' }
    ],
    goalX: 2450,
    goalY: 420
  },
  {
    name: 'Fase 3: Fortaleza do Barão Dobermann 🏰',
    skyTop: '#1d3557',
    skyBottom: '#457b9d',
    groundColor: '#6c757d',
    dirtColor: '#343a40',
    width: 1400,
    platforms: [
      { x: 0, y: 500, w: 1400, h: 90 },
      { x: 180, y: 375, w: 190, h: 22, passThrough: true },
      { x: 520, y: 285, w: 240, h: 22, passThrough: true },
      { x: 920, y: 375, w: 190, h: 22, passThrough: true }
    ],
    springs: [
      { x: 110, y: 472, w: 44, h: 28, bounceAnim: 0 },
      { x: 1140, y: 472, w: 44, h: 28, bounceAnim: 0 }
    ],
    kittens: [
      { x: 615, y: 237, name: 'Mel', color: '#ffbe0b', lockedByBoss: true },
      { x: 1180, y: 452, name: 'Floquinho', color: '#caf0f8', lockedByBoss: true }
    ],
    enemies: [
      { x: 350, y: 180, type: 'crow', minX: 160, maxX: 1050 }
    ],
    items: [
      { x: 250, y: 335, type: 'yarn_power' },
      { x: 635, y: 245, type: 'milk' },
      { x: 990, y: 335, type: 'yarn_power' }
    ],
    hasBoss: true,
    bossX: 880,
    bossY: 416,
    bossMinX: 170,
    bossMaxX: 1120,
    goalX: 1265,
    goalY: 420
  }
];

// ============================================================================
// GERENCIADOR PRINCIPAL DO JOGO
// ============================================================================
const MAX_PARTICLES = 42;
const MAX_TEXTS = 10;

class Game {
  constructor() {
    this.state = 'menu';
    this.levelIndex = 0;
    this.lives = 5;
    this.score = 0;
    this.rescuedCount = 0;
    this.camX = 0;
    this.levelWidth = 2400;
    this.checkpointX = 80;
    this.checkpointY = 400;

    this.player = new Player(80, 400);
    this.platforms = [];
    this.springs = [];
    this.kittens = [];
    this.enemies = [];
    this.items = [];
    this.yarns = [];
    this.particles = [];
    this.texts = [];
    this.boss = null;

    // Cache offscreen do céu gradiente + sol/lua para não recriar todo frame
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = canvas.width;
    this.skyCanvas.height = canvas.height;
    this.resizeCanvas();
  }

  resizeCanvas() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const targetHeight = 576;
      const ratio = rect.width / rect.height;
      const targetWidth = Math.max(400, Math.min(1180, Math.round(targetHeight * ratio)));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        this.skyCanvas.width = targetWidth;
        this.skyCanvas.height = targetHeight;
      }
    }
    this.bakeSky(LEVELS[this.levelIndex]);
  }

  bakeSky(lvl) {
    const sctx = this.skyCanvas.getContext('2d');
    const grad = sctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, lvl.skyTop);
    grad.addColorStop(1, lvl.skyBottom);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, canvas.width, canvas.height);

    // Sol ou Lua pré-renderizado no céu (posicionado proporcionalmente à largura)
    sctx.fillStyle = this.levelIndex === 2 ? '#f1faee' : '#ffd166';
    sctx.beginPath();
    sctx.arc(Math.max(120, canvas.width - 110), 90, 38, 0, Math.PI * 2);
    sctx.fill();
  }

  startNewGame() {
    sound.init();
    this.lives = 5;
    this.score = 0;
    this.levelIndex = 0;
    this.loadLevel(0);
    this.state = 'playing';
    overlayScreen.classList.add('hidden');
    sound.meow();
    sound.startMusic();
  }

  loadLevel(idx) {
    this.levelIndex = idx;
    const data = LEVELS[idx];
    this.levelWidth = data.width;
    this.rescuedCount = 0;
    this.checkpointX = 70;
    this.checkpointY = 410;

    this.bakeSky(data);

    this.player = new Player(70, 410);
    this.platforms = data.platforms.map((p) => ({ ...p }));
    this.springs = data.springs.map((s) => ({ ...s }));
    this.kittens = data.kittens.map(
      (k) => new KittenCage(k.x, k.y, k.name, k.color, !!k.lockedByBoss)
    );
    this.enemies = data.enemies.map(
      (e) => new AnimalEnemy(e.x, e.y, e.type, e.minX, e.maxX)
    );
    this.items = data.items.map((it) => ({ ...it, collected: false, anim: Math.random() * 6 }));
    this.yarns = [];
    this.particles = [];
    this.texts = [];

    if (data.hasBoss) {
      this.boss = new BossDobermann(data.bossX, data.bossY, data.bossMinX, data.bossMaxX);
      bossHud.classList.remove('hidden');
      bossBarFill.style.width = '100%';
    } else {
      this.boss = null;
      bossHud.classList.add('hidden');
    }

    this.updateHUD();
  }

  updateHUD() {
    hudLives.textContent = '❤️'.repeat(Math.max(0, this.lives)) || '💔';
    hudKittens.textContent = `${this.rescuedCount} / ${this.kittens.length}`;
    hudScore.textContent = this.score;
    hudLevelName.textContent = LEVELS[this.levelIndex].name;
  }

  spawnParticles(x, y, color, count = 8, shape = 'circle') {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) {
        this.particles.shift();
      }
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.2;
      this.particles.push(
        new Particle(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - 1.5,
          color,
          3.5 + Math.random() * 2.5,
          24 + Math.random() * 14,
          shape
        )
      );
    }
  }

  update() {
    if (this.state !== 'playing') return;

    this.player.update(this.platforms, this.springs);

    for (let i = 0; i < this.springs.length; i++) {
      if (this.springs[i].bounceAnim > 0) this.springs[i].bounceAnim--;
    }

    // Atualiza novelos de lã lançados
    for (let i = this.yarns.length - 1; i >= 0; i--) {
      const y = this.yarns[i];
      y.update(this.platforms);

      for (let j = 0; j < this.enemies.length; j++) {
        const e = this.enemies[j];
        if (
          !e.wrapped &&
          y.x + y.r > e.x &&
          y.x - y.r < e.x + e.w &&
          y.y + y.r > e.y &&
          y.y - y.r < e.y + e.h
        ) {
          e.wrapInYarn(y.color);
          y.life = 0;
          break;
        }
      }

      if (
        this.boss &&
        this.boss.state !== 'defeated' &&
        y.x + y.r > this.boss.x &&
        y.x - y.r < this.boss.x + this.boss.w &&
        y.y + y.r > this.boss.y &&
        y.y - y.r < this.boss.y + this.boss.h
      ) {
        this.boss.takeHit(1);
        y.life = 0;
      }

      if (y.life <= 0) {
        this.yarns[i] = this.yarns[this.yarns.length - 1];
        this.yarns.pop();
      }
    }

    // Atualiza Filhotes
    for (let i = 0; i < this.kittens.length; i++) {
      this.kittens[i].update(this.player, i);
    }

    const clawBox = this.player.dashTimer > 0 ? this.player.getClawBox() : null;

    // Atualiza Inimigos
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update();

      if (e.wrapped) {
        if (e.y > canvas.height + 100) {
          this.enemies[i] = this.enemies[this.enemies.length - 1];
          this.enemies.pop();
        }
        continue;
      }

      // Se o Ataque de Garras atingir o vilão na frente da Chelly
      if (
        clawBox &&
        clawBox.x < e.x + e.w &&
        clawBox.x + clawBox.w > e.x &&
        clawBox.y < e.y + e.h &&
        clawBox.y + clawBox.h > e.y
      ) {
        e.wrapInYarn('#ffffff');
        continue;
      }

      if (this.player.intersects(e)) {
        const stomp = this.player.vy > 0 && this.player.y + this.player.h - this.player.vy <= e.y + 18;
        if (stomp || this.player.dashTimer > 0 || this.player.rainbowTimer > 0) {
          e.wrapInYarn('#06d6a0');
          if (stomp) this.player.vy = -10;
        } else {
          this.player.takeDamage();
        }
      }
    }

    // Atualiza Chefão Barão Dobermann
    if (this.boss) {
      this.boss.update(this.player);

      // Garras também cortam os ossinhos lançados pelo Dobermann!
      if (clawBox) {
        for (let i = this.boss.projectiles.length - 1; i >= 0; i--) {
          const p = this.boss.projectiles[i];
          if (
            clawBox.x < p.x + p.r &&
            clawBox.x + clawBox.w > p.x - p.r &&
            clawBox.y < p.y + p.r &&
            clawBox.y + clawBox.h > p.y - p.r
          ) {
            this.spawnParticles(p.x, p.y, '#ffffff', 5, 'star');
            this.boss.projectiles.splice(i, 1);
          }
        }
      }

      if (this.boss.state !== 'defeated') {
        const hitByClaw =
          clawBox &&
          clawBox.x < this.boss.x + this.boss.w &&
          clawBox.x + clawBox.w > this.boss.x &&
          clawBox.y < this.boss.y + this.boss.h &&
          clawBox.y + clawBox.h > this.boss.y;

        if (hitByClaw) {
          this.boss.takeHit(2);
          this.player.vx = -this.player.dir * 5;
        } else if (this.player.intersects(this.boss)) {
          const stomp =
            this.player.vy > 0 &&
            this.player.y + this.player.h - this.player.vy <= this.boss.y + 24;
          if (stomp || this.player.dashTimer > 0) {
            this.boss.takeHit(2);
            this.player.vy = -11.5;
            this.player.vx = -this.player.dir * 6;
          } else {
            this.player.takeDamage();
          }
        }
      }
    }

    // Atualiza Itens Colecionáveis
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.collected) continue;
      it.anim += 0.1;
      if (
        this.player.x < it.x + 28 &&
        this.player.x + this.player.w > it.x &&
        this.player.y < it.y + 28 &&
        this.player.y + this.player.h > it.y
      ) {
        it.collected = true;
        if (it.type === 'fish') {
          this.score += 25;
          sound.collectFish();
          this.spawnParticles(it.x + 14, it.y + 14, '#ffb703', 6);
          this.texts.push(new FloatingText(it.x, it.y, '+25', '#ffb703'));
        } else if (it.type === 'milk') {
          this.lives = Math.min(5, this.lives + 1);
          sound.collectPowerup();
          this.spawnParticles(it.x + 14, it.y + 14, '#ff4d6d', 8, 'heart');
          this.texts.push(new FloatingText(it.x, it.y, '+1 Vida!', '#ff4d6d'));
        } else if (it.type === 'yarn_power') {
          this.player.rainbowTimer = 480;
          sound.collectPowerup();
          this.spawnParticles(it.x + 14, it.y + 14, '#8338ec', 10, 'star');
          this.texts.push(new FloatingText(it.x, it.y, 'Super Novelo Triplo!', '#8338ec'));
        }
        if (this.texts.length > MAX_TEXTS) this.texts.shift();
        this.updateHUD();
      }
    }

    // Verifica chegada na Casinha de Gato no final da fase
    const lvl = LEVELS[this.levelIndex];
    const allRescued = this.rescuedCount >= this.kittens.length;
    if (
      allRescued &&
      this.player.x + this.player.w > lvl.goalX &&
      this.player.x < lvl.goalX + 80 &&
      this.player.y + this.player.h > lvl.goalY
    ) {
      this.completeLevel();
    }

    // Atualiza Partículas (swap-and-pop sem realocação de array)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.update();
      if (pt.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      }
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const tx = this.texts[i];
      tx.update();
      if (tx.life <= 0) {
        this.texts[i] = this.texts[this.texts.length - 1];
        this.texts.pop();
      }
    }

    // Câmera suave acompanhando a Chelly
    const targetCamX = this.player.x - canvas.width * 0.35;
    this.camX += (targetCamX - this.camX) * 0.12;
    this.camX = Math.max(0, Math.min(this.levelWidth - canvas.width, this.camX));
  }

  completeLevel() {
    sound.victory();
    const controlsGrid = document.querySelector('.controls-grid');
    const villainsPreview = document.querySelector('.villains-preview');
    const victoryCanvas = document.getElementById('victoryCanvas');
    if (controlsGrid) controlsGrid.classList.add('hidden');
    if (villainsPreview) villainsPreview.classList.add('hidden');

    if (this.levelIndex < LEVELS.length - 1) {
      this.state = 'level_clear';
      if (victoryCanvas) victoryCanvas.classList.add('hidden');
      modalIcon.classList.remove('hidden');
      modalIcon.textContent = '🐱🎉🐾';
      modalTitle.textContent = `${LEVELS[this.levelIndex].name} Concluída!`;
      modalSubtitle.innerHTML = `Parabéns! A gata <strong>Chelly</strong> salvou os filhotes desta região!<br/>Prepare-se para a próxima etapa da aventura!`;
      btnStart.textContent = '🐾 Próxima Fase!';
      overlayScreen.classList.remove('hidden');
    } else {
      this.state = 'victory';
      modalIcon.classList.add('hidden');
      if (victoryCanvas) {
        victoryCanvas.classList.remove('hidden');
        this.drawVictoryBanner();
      }
      modalTitle.textContent = 'Vitória! A Família Está Reunida!';
      modalSubtitle.innerHTML = `A mamãe <strong>Chelly</strong> salvou <strong>Mingau, Bolinha, Pipoca, Frajola, Mel e Floquinho</strong>!<br/><strong>Pontuação Final: ${this.score} 🐟</strong>`;
      btnStart.textContent = '🔄 Jogar Novamente!';
      overlayScreen.classList.remove('hidden');
    }
  }

  triggerGameOver() {
    this.state = 'gameover';
    const controlsGrid = document.querySelector('.controls-grid');
    const villainsPreview = document.querySelector('.villains-preview');
    const victoryCanvas = document.getElementById('victoryCanvas');
    if (controlsGrid) controlsGrid.classList.add('hidden');
    if (villainsPreview) villainsPreview.classList.add('hidden');
    if (victoryCanvas) victoryCanvas.classList.add('hidden');
    modalIcon.classList.remove('hidden');

    modalIcon.textContent = '😿💤';
    modalTitle.textContent = 'A Chelly ficou cansada!';
    modalSubtitle.innerHTML = 'Não desista! Os filhotinhos ainda estão esperando pelo resgate da mamãe Chelly!';
    btnStart.textContent = '🐾 Tentar Fase Novamente';
    overlayScreen.classList.remove('hidden');
  }

  drawVictoryBanner() {
    const vCanvas = document.getElementById('victoryCanvas');
    if (!vCanvas) return;
    const vc = vCanvas.getContext('2d');
    const w = vCanvas.width;
    const h = vCanvas.height;
    const t = performance.now() * 0.004;

    // Céu azul de festa
    const sky = vc.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#48cae4');
    sky.addColorStop(1, '#caf0f8');
    vc.fillStyle = sky;
    vc.fillRect(0, 0, w, h);

    // Arco-íris de comemoração ao fundo
    const rainbowColors = ['#ff4d6d', '#ffb703', '#06d6a0', '#3a86ff', '#8338ec'];
    vc.lineWidth = 7;
    for (let i = 0; i < rainbowColors.length; i++) {
      vc.strokeStyle = rainbowColors[i];
      vc.beginPath();
      vc.arc(w / 2, h + 15, 165 - i * 7, Math.PI * 1.12, Math.PI * 1.88);
      vc.stroke();
    }

    // Bandeirinhas de festa no topo
    vc.strokeStyle = '#4a5568';
    vc.lineWidth = 2;
    vc.beginPath();
    vc.moveTo(0, 12);
    vc.quadraticCurveTo(w / 2, 28, w, 12);
    vc.stroke();

    for (let i = 0; i < 12; i++) {
      const fx = 16 + i * 38;
      const fy = 14 + Math.sin((i / 11) * Math.PI) * 8;
      vc.fillStyle = rainbowColors[i % rainbowColors.length];
      vc.beginPath();
      vc.moveTo(fx, fy);
      vc.lineTo(fx + 20, fy);
      vc.lineTo(fx + 10, fy + 18);
      vc.closePath();
      vc.fill();
    }

    // Gramado florido
    vc.fillStyle = '#52b788';
    vc.beginPath();
    vc.ellipse(w / 2, h + 10, w * 0.65, 58, 0, Math.PI, 0);
    vc.fill();

    // Confetes coloridos caindo
    for (let i = 0; i < 18; i++) {
      const cx = (i * 57 + Math.sin(t + i) * 14) % w;
      const cy = ((i * 29 + t * 18) % (h - 45)) + 10;
      vc.fillStyle = rainbowColors[i % rainbowColors.length];
      vc.fillRect(cx, cy, 6, 6);
    }

    // MAMÃE CHELLY NO CENTRO (Gata Cinza Feliz!)
    vc.save();
    vc.translate(w / 2, 134 + Math.sin(t * 1.5) * 2);

    // Rabinho cinza abanando feliz
    const tailWag = Math.sin(t * 3) * 8;
    vc.strokeStyle = '#8d99ae';
    vc.lineWidth = 8;
    vc.lineCap = 'round';
    vc.beginPath();
    vc.moveTo(-18, 12);
    vc.quadraticCurveTo(-40, -4 + tailWag, -32, -24 + tailWag);
    vc.stroke();

    // Corpo cinza da Chelly
    vc.fillStyle = '#9aa5b1';
    vc.strokeStyle = '#4a5568';
    vc.lineWidth = 2.5;
    vc.beginPath();
    vc.roundRect(-22, -4, 44, 30, 14);
    vc.fill();
    vc.stroke();

    // Barriguinha clara
    vc.fillStyle = '#f1f5f9';
    vc.beginPath();
    vc.ellipse(0, 11, 13, 10, 0, 0, Math.PI * 2);
    vc.fill();

    // Patinhas brancas/cinza-claro
    vc.fillStyle = '#e2e8f0';
    vc.beginPath();
    vc.ellipse(-12, 25, 7, 5, 0, 0, Math.PI * 2);
    vc.ellipse(12, 25, 7, 5, 0, 0, Math.PI * 2);
    vc.fill();
    vc.stroke();

    // Cabeça cinza da Chelly
    vc.fillStyle = '#9aa5b1';
    vc.beginPath();
    vc.arc(0, -18, 20, 0, Math.PI * 2);
    vc.fill();
    vc.stroke();

    // Listrinhas cinza-escuras no topo da cabeça
    vc.fillStyle = '#64748b';
    vc.fillRect(-5, -34, 3, 6);
    vc.fillRect(2, -34, 3, 6);

    // Orelhas cinzas
    vc.fillStyle = '#9aa5b1';
    vc.beginPath();
    vc.moveTo(-16, -28);
    vc.lineTo(-10, -45);
    vc.lineTo(-2, -34);
    vc.closePath();
    vc.fill();
    vc.stroke();

    vc.beginPath();
    vc.moveTo(2, -34);
    vc.lineTo(10, -45);
    vc.lineTo(16, -28);
    vc.closePath();
    vc.fill();
    vc.stroke();

    // Interior rosa das orelhas
    vc.fillStyle = '#ff8fab';
    vc.beginPath();
    vc.moveTo(-13, -30);
    vc.lineTo(-9, -40);
    vc.lineTo(-4, -34);
    vc.moveTo(4, -34);
    vc.lineTo(9, -40);
    vc.lineTo(13, -30);
    vc.fill();

    // Olhinhos felizes sorrindo (^ ^)
    vc.strokeStyle = '#1d3557';
    vc.lineWidth = 2.5;
    vc.beginPath();
    vc.arc(-7, -19, 4, Math.PI * 1.1, Math.PI * 1.9);
    vc.stroke();
    vc.beginPath();
    vc.arc(7, -19, 4, Math.PI * 1.1, Math.PI * 1.9);
    vc.stroke();

    // Focinho rosa e sorriso
    vc.fillStyle = '#ff758f';
    vc.beginPath();
    vc.arc(0, -13, 3, 0, Math.PI * 2);
    vc.fill();

    vc.strokeStyle = '#475569';
    vc.lineWidth = 1.6;
    vc.beginPath();
    vc.arc(-3, -10, 3, 0, Math.PI);
    vc.arc(3, -10, 3, 0, Math.PI);
    vc.stroke();

    // Coraçãozinho acima da Mamãe Chelly
    const heartY = -56 + Math.sin(t * 2) * 3;
    vc.fillStyle = '#ff4d6d';
    vc.beginPath();
    vc.arc(-4, heartY, 5, 0, Math.PI * 2);
    vc.arc(4, heartY, 5, 0, Math.PI * 2);
    vc.moveTo(-9, heartY + 2);
    vc.lineTo(0, heartY + 11);
    vc.lineTo(9, heartY + 2);
    vc.fill();

    vc.restore();

    // OS 6 FILHOTINHOS COMEMORANDO AO REDOR DA CHELLY
    const allKittens = [
      { name: 'Mingau', color: '#ffffff', x: 52, y: 152 },
      { name: 'Bolinha', color: '#ff9f1c', x: 112, y: 147 },
      { name: 'Pipoca', color: '#ffd166', x: 172, y: 150 },
      { name: 'Frajola', color: '#adb5bd', x: 308, y: 150 },
      { name: 'Mel', color: '#ffbe0b', x: 368, y: 147 },
      { name: 'Floquinho', color: '#caf0f8', x: 428, y: 152 }
    ];

    allKittens.forEach((k, idx) => {
      const bounce = Math.abs(Math.sin(t * 2.2 + idx * 0.9)) * 10;
      const kx = k.x;
      const ky = k.y - bounce;
      const dir = idx < 3 ? 1 : -1;

      vc.save();
      vc.translate(kx, ky);
      vc.scale(dir, 1);

      // Rabinho do filhote
      vc.strokeStyle = k.color;
      vc.lineWidth = 4;
      vc.beginPath();
      vc.moveTo(-8, 4);
      vc.lineTo(-16, -4);
      vc.stroke();

      // Corpo e cabeça do filhotinho
      vc.fillStyle = k.color;
      vc.strokeStyle = '#3d405b';
      vc.lineWidth = 2;

      vc.beginPath();
      vc.ellipse(0, 5, 11, 8, 0, 0, Math.PI * 2);
      vc.fill();
      vc.stroke();

      vc.beginPath();
      vc.arc(2, -5, 10, 0, Math.PI * 2);
      vc.fill();
      vc.stroke();

      // Orelhinhas
      vc.beginPath();
      vc.moveTo(-5, -11);
      vc.lineTo(-2, -19);
      vc.lineTo(3, -13);
      vc.moveTo(4, -13);
      vc.lineTo(9, -19);
      vc.lineTo(11, -11);
      vc.fill();
      vc.stroke();

      // Olhinho e focinho
      vc.fillStyle = '#1d3557';
      vc.beginPath();
      vc.arc(6, -6, 2, 0, Math.PI * 2);
      vc.fill();

      vc.fillStyle = '#ff758f';
      vc.beginPath();
      vc.arc(10, -4, 1.8, 0, Math.PI * 2);
      vc.fill();

      vc.restore();

      // Nome do filhote na grama
      vc.font = 'bold 11px "Segoe UI", sans-serif';
      vc.textAlign = 'center';
      vc.fillStyle = '#ffffff';
      vc.fillText(k.name, kx, 185);
    });
  }

  draw() {
    if (this.state === 'victory') {
      this.drawVictoryBanner();
    }
    const lvl = LEVELS[this.levelIndex];

    // Céu pré-renderizado (muito mais rápido que criar gradiente todo frame)
    ctx.drawImage(this.skyCanvas, 0, 0);

    // Nuvens e Colinas em Paralaxe
    this.drawBackground();

    // Casinha/Cesta de Chegada no fim da fase
    const gx = lvl.goalX - this.camX;
    if (gx > -120 && gx < canvas.width + 120) {
      this.drawGoalHouse(gx, lvl.goalY);
    }

    // Plataformas (com frustum culling)
    for (let i = 0; i < this.platforms.length; i++) {
      const p = this.platforms[i];
      const px = p.x - this.camX;
      if (px + p.w < -20 || px > canvas.width + 20) continue;

      ctx.fillStyle = lvl.dirtColor;
      ctx.beginPath();
      ctx.roundRect(px, p.y, p.w, p.h, 10);
      ctx.fill();

      ctx.fillStyle = lvl.groundColor;
      ctx.fillRect(px + 2, p.y, p.w - 4, 14);
    }

    // Cogumelos Trampolim (com frustum culling)
    for (let i = 0; i < this.springs.length; i++) {
      const s = this.springs[i];
      const sx = s.x - this.camX;
      if (sx < -50 || sx > canvas.width + 50) continue;

      const squeeze = s.bounceAnim > 0 ? Math.sin(s.bounceAnim) * 5 : 0;
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(sx + 14, s.y + 10 + squeeze, 16, 18 - squeeze);

      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.ellipse(sx + 22, s.y + 10 + squeeze, 24, 12, 0, Math.PI, 0);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx + 13, s.y + 5 + squeeze, 3.5, 0, Math.PI * 2);
      ctx.arc(sx + 23, s.y + 3 + squeeze, 4, 0, Math.PI * 2);
      ctx.arc(sx + 32, s.y + 6 + squeeze, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Itens Colecionáveis usando SpriteCache (sem fillText de emoji)
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.collected) continue;
      const ix = it.x - this.camX;
      if (ix < -40 || ix > canvas.width + 40) continue;
      const iy = it.y + Math.sin(it.anim) * 5;
      const sprite = SpriteCache.sprites[it.type];
      if (sprite) {
        ctx.drawImage(sprite, ix - 4, iy - 4);
      }
    }

    // Gaiolas e Filhotes
    for (let i = 0; i < this.kittens.length; i++) {
      this.kittens[i].draw(ctx, this.camX);
    }

    // Inimigos Animais
    for (let i = 0; i < this.enemies.length; i++) {
      this.enemies[i].draw(ctx, this.camX);
    }

    // Chefão Barão Dobermann
    if (this.boss) {
      this.boss.draw(ctx, this.camX);
    }

    // Novelos de Lã
    for (let i = 0; i < this.yarns.length; i++) {
      this.yarns[i].draw(ctx, this.camX);
    }

    // Protagonista Gata Chelly
    this.player.draw(ctx, this.camX);

    // Partículas e Textos Flutuantes
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].draw(ctx, this.camX);
    }
    for (let i = 0; i < this.texts.length; i++) {
      this.texts[i].draw(ctx, this.camX);
    }
  }

  drawBackground() {
    // Nuvens fofas agrupadas num único path
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 380 - this.camX * 0.25) % (canvas.width + 300)) - 100;
      const cy = 70 + (i % 3) * 45;
      ctx.moveTo(cx + 24, cy);
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.moveTo(cx + 52, cy - 8);
      ctx.arc(cx + 22, cy - 8, 30, 0, Math.PI * 2);
      ctx.moveTo(cx + 68, cy);
      ctx.arc(cx + 46, cy, 22, 0, Math.PI * 2);
    }
    ctx.fill();

    // Colinas distantes agrupadas num único path
    ctx.fillStyle = this.levelIndex === 0 ? '#95d5b2' : this.levelIndex === 1 ? '#5a189a' : '#2b2d42';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const hx = i * 440 - this.camX * 0.45;
      if (hx + 420 < 0 || hx - 20 > canvas.width) continue;
      ctx.moveTo(hx + 200, 520);
      ctx.arc(hx + 200, 520, 220, Math.PI, 0);
    }
    ctx.fill();
  }

  drawGoalHouse(gx, gy) {
    const allRescued = this.rescuedCount >= this.kittens.length;
    ctx.save();
    ctx.fillStyle = '#ffccd5';
    ctx.strokeStyle = '#c9184a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(gx, gy, 84, 80, 12);
    ctx.fill();
    ctx.stroke();

    // Telhado
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.moveTo(gx - 12, gy + 5);
    ctx.lineTo(gx + 42, gy - 38);
    ctx.lineTo(gx + 96, gy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Porta
    ctx.fillStyle = allRescued ? '#ffb703' : '#495057';
    ctx.beginPath();
    ctx.roundRect(gx + 24, gy + 32, 36, 48, 12);
    ctx.fill();

    // Placa indicativa acima da casinha
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    const msg = allRescued ? 'Entre Aqui!' : 'Salve os Filhotes!';
    ctx.fillStyle = '#1d3557';
    ctx.fillText(msg, gx - 5, gy - 44);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(msg, gx - 6, gy - 45);
    ctx.restore();
  }
}

const game = new Game();

// ============================================================================
// EVENTOS DOS BOTÕES E LOOP PRINCIPAL COM CONTROLE DE FPS (60 HZ)
// ============================================================================
btnStart.addEventListener('click', () => {
  sound.init();
  if (game.state === 'paused') {
    game.state = 'playing';
    overlayScreen.classList.add('hidden');
  } else if (game.state === 'menu' || game.state === 'victory') {
    game.startNewGame();
  } else if (game.state === 'level_clear') {
    game.loadLevel(game.levelIndex + 1);
    game.state = 'playing';
    overlayScreen.classList.add('hidden');
    sound.startMusic();
  } else if (game.state === 'gameover') {
    game.lives = 5;
    game.loadLevel(game.levelIndex);
    game.state = 'playing';
    overlayScreen.classList.add('hidden');
    sound.startMusic();
  }
});

btnSound.addEventListener('click', () => sound.toggle());

btnRestart.addEventListener('click', () => {
  sound.init();
  game.lives = 5;
  game.loadLevel(game.levelIndex);
  game.state = 'playing';
  overlayScreen.classList.add('hidden');
});

btnHelp.addEventListener('click', () => {
  if (game.state === 'playing') {
    game.state = 'paused';
    const controlsGrid = document.querySelector('.controls-grid');
    const villainsPreview = document.querySelector('.villains-preview');
    const victoryCanvas = document.getElementById('victoryCanvas');
    if (controlsGrid) controlsGrid.classList.remove('hidden');
    if (villainsPreview) villainsPreview.classList.add('hidden');
    if (victoryCanvas) victoryCanvas.classList.add('hidden');
    modalIcon.classList.remove('hidden');
    modalIcon.textContent = '🐱🎮🐾';
    modalTitle.textContent = 'Jogo Pausado — Controles';
    modalSubtitle.innerHTML = 'Salve todos os filhotes de cada fase e leve-os até a Casinha no final!';
    btnStart.textContent = '▶️ Continuar Aventura';
    overlayScreen.classList.remove('hidden');
  } else if (game.state === 'paused') {
    game.state = 'playing';
    overlayScreen.classList.add('hidden');
  }
});

const btnFullscreen = document.getElementById('btn-fullscreen');
if (btnFullscreen) {
  btnFullscreen.addEventListener('click', () => {
    const elem = document.documentElement;
    if (!document.fullscreenElement) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    setTimeout(() => game.resizeCanvas(), 200);
  });
}

window.addEventListener('resize', () => game.resizeCanvas());
window.addEventListener('orientationchange', () => {
  setTimeout(() => game.resizeCanvas(), 150);
});

let lastTime = performance.now();
const FRAME_DURATION = 1000 / 60;
let accumulator = 0;

function gameLoop(now) {
  GamepadManager.poll();

  const delta = Math.min(now - lastTime, 100);
  lastTime = now;
  accumulator += delta;

  while (accumulator >= FRAME_DURATION) {
    game.update();
    accumulator -= FRAME_DURATION;
  }

  game.draw();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
