(async () => {
    // Миттєва ініціалізація екрана для мобільних телефонів (до завантаження Three.js)
    const setMobileOverlayLang = (lang) => {
      const isUk = lang === 'uk';
      const titleEl = document.getElementById('ui-mobile-unsupported-title');
      const subEl = document.getElementById('ui-mobile-unsupported-sub');
      const btnEn = document.getElementById('mobile-lang-en');
      const btnUk = document.getElementById('mobile-lang-uk');
      if (titleEl) {
        titleEl.textContent = isUk
          ? 'Дана платформа не підтримується на даному пристрої'
          : 'This platform is not supported on this device';
      }
      if (subEl) {
        subEl.textContent = isUk
          ? 'Інтерактивний 3D-практикум з фізики розрахований на роботу з комп’ютера або ноутбука. Будь ласка, відкрийте сайт на ПК.'
          : 'The interactive 3D physics laboratory is designed for desktop and laptop computers. Please open this site on a PC.';
      }
      if (btnEn) btnEn.classList.toggle('active', !isUk);
      if (btnUk) btnUk.classList.toggle('active', isUk);
    };

    const mobBtnEnEarly = document.getElementById('mobile-lang-en');
    const mobBtnUkEarly = document.getElementById('mobile-lang-uk');
    if (mobBtnEnEarly) mobBtnEnEarly.addEventListener('click', () => setMobileOverlayLang('en'));
    if (mobBtnUkEarly) mobBtnUkEarly.addEventListener('click', () => setMobileOverlayLang('uk'));

    const THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');

    // ============================================================================
    // 0. РЕНДЕРИНГ МАТЕМАТИЧНИХ ФОРМУЛ (KaTeX) БЕЗ ВИХОДУ ЗА РАМКИ
    // ============================================================================
    function renderMathString(latex, displayMode = false) {
      if (window.katex) {
        try {
          return window.katex.renderToString(latex, {
            displayMode,
            throwOnError: false,
            trust: true
          });
        } catch (e) {
          return `<code>${latex}</code>`;
        }
      }
      return `<code>${latex}</code>`;
    }

    // Розбиває багаторядкові системи \begin{aligned}...\end{aligned} та довгі рядки з \qquad на окремі охайні рівняння
    function renderStackedMath(latex) {
      if (!latex) return '';
      let s = latex.trim();
      let parts = [];

      if (s.includes('\\begin{cases}')) {
        const m = s.match(/^([\s\S]*?\\end\{cases\})\s*(\\implies[\s\S]*)$/);
        parts = m ? [m[1].trim(), m[2].trim()] : [s];
      } else {
        s = s.replace(/\\begin\{aligned\}/g, '').replace(/\\end\{aligned\}/g, '');
        const lines = s.split(/\\\\/g);
        for (const rawLine of lines) {
          const line = rawLine.replace(/&=/g, '=').replace(/&/g, '').trim();
          if (!line) continue;
          const subparts = line.split(/,?\s*\\qquad\s*|,\s*\\quad\s*/g);
          for (let sp of subparts) {
            sp = sp.trim().replace(/,$/, '').trim();
            if (!sp) continue;
            if (sp.length > 72 && sp.includes('\\implies')) {
              const impParts = sp.split(/\s*(?=\\implies)/g);
              for (const ip of impParts) {
                if (ip.trim()) parts.push(ip.trim());
              }
            } else {
              parts.push(sp);
            }
          }
        }
      }

      const rows = parts
        .map(part => `<div class="math-fit-outer"><div class="math-fit-inner">${renderMathString(part, true)}</div></div>`)
        .join('');
      return `<div class="math-stack">${rows}</div>`;
    }

    // Розбиває живі числові підстановки на компактні бейджі, що переносяться без виходу за межі блоку
    function renderLiveMathChips(latex) {
      if (!latex) return '';
      const parts = latex
        .split(/,?\s*\\qquad\s*|,\s*\\quad\s*/g)
        .map(s => s.trim().replace(/,$/, '').trim())
        .filter(Boolean);
      const chips = parts
        .map(part => `<span class="math-chip"><span class="math-fit-inner">${renderMathString(part, false)}</span></span>`)
        .join('');
      return `<div class="math-chips-wrap">${chips}</div>`;
    }

    // Масштабує будь-яку широку формулу так, щоб вона гарантовано поміщалася в ширину картки
    function fitMathContainers() {
      document.querySelectorAll('.math-fit-outer, .math-chip').forEach(outer => {
        const inner = outer.querySelector('.math-fit-inner');
        if (!inner) return;
        inner.style.transform = 'none';
        outer.style.height = 'auto';
        const isChip = outer.classList.contains('math-chip');
        const availW = outer.clientWidth - (isChip ? 14 : 6);
        const contentW = inner.scrollWidth;
        if (availW > 20 && contentW > availW) {
          const scale = Math.max(0.48, availW / contentW);
          inner.style.transformOrigin = isChip ? 'left center' : 'center center';
          inner.style.transform = `scale(${scale.toFixed(3)})`;
          const rawH = inner.offsetHeight;
          if (rawH > 0) {
            outer.style.height = `${Math.ceil(rawH * scale)}px`;
          }
        }
      });
    }

    // Замінює інлайн-формули виду $...$ та **жирний** акцент у тексті на відрендерений KaTeX HTML
    function formatTextbookProse(textWithMath) {
      if (!textWithMath) return '';
      return textWithMath
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\$([^$]+)\$/g, (_, tex) => renderMathString(tex, false));
    }

    // ============================================================================
    // 1. ІНІЦІАЛІЗАЦІЯ 3D-СЦЕНИ У СТИЛІ APPLE / GOOGLE СВІТЛОЇ СТУДІЇ
    // ============================================================================
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f6);
    scene.fog = new THREE.FogExp2(0xeef2f6, 0.011);

    const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 6.2, 16.0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 4;
    controls.maxDistance = 42;
    controls.target.set(0, 2.0, 0);

    // Чисте студійне освітлення
    const ambientLight = new THREE.AmbientLight(0xf8fafc, 1.38);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdbe4ef, 0.85);
    hemiLight.position.set(0, 25, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.65);
    dirLight.position.set(11, 20, 14);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 55;
    const d = 15;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0004;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xe0f2fe, 0.55);
    rimLight.position.set(-12, 10, -10);
    scene.add(rimLight);

    // Процедурна студійна карта відбиттів (PMREM) для реалістичного блиску металів і скла
    try {
      const pmremGen = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0xeef2f6);
      const skyDome = new THREE.Mesh(
        new THREE.SphereGeometry(20, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.BackSide })
      );
      envScene.add(skyDome);
      const softboxTop = new THREE.Mesh(
        new THREE.PlaneGeometry(18, 18),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
      );
      softboxTop.position.set(4, 14, 6);
      softboxTop.lookAt(0, 0, 0);
      envScene.add(softboxTop);
      const softboxSide = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 10),
        new THREE.MeshBasicMaterial({ color: 0xe0f2fe, side: THREE.DoubleSide })
      );
      softboxSide.position.set(-12, 6, -8);
      softboxSide.lookAt(0, 0, 0);
      envScene.add(softboxSide);
      const warmBounce = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 24),
        new THREE.MeshBasicMaterial({ color: 0xdbe4ef, side: THREE.DoubleSide })
      );
      warmBounce.rotation.x = -Math.PI / 2;
      warmBounce.position.y = -6;
      envScene.add(warmBounce);
      scene.environment = pmremGen.fromScene(envScene, 0.04).texture;
      pmremGen.dispose();
    } catch (e) {}

    // Світла студійна основа сцени + делікатна координатна сітка
    const floorGeo = new THREE.PlaneGeometry(90, 90);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xeef2f6,
      roughness: 0.92,
      metalness: 0.02
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const gridHelper = new THREE.GridHelper(40, 40, 0xc2cddb, 0xd8e1ec);
    gridHelper.position.y = 0.004;
    gridHelper.material.opacity = 0.65;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // ============================================================================
    // 2. КРЕСЛЯРСЬКІ 3D-ВЕКТОРИ З КАЛІГРАФІЧНИМИ ПІДПИСАМИ ТА СИСТЕМА ЧАСТИНОК
    // ============================================================================
    const VECTOR_LABEL_EN = {
      'F_тер': 'F_fric',
      'F_пруж': 'F_spr',
      'F_оп': 'F_drag',
      'v (лінійна)': 'v (linear)',
      'F_дц = mω²R': 'F_c = mω²R',
      'F_Архімеда': 'F_buoy',
      'mg (тяжіння)': 'mg (gravity)',
      'F_газу = P·S': 'F_gas = P·S',
      'F_зовн (поршень)': 'F_ext (piston)',
      'k₁ (падаючий фронт)': 'k₁ (incident)',
      'k₂ (заломлений фронт)': 'k₂ (refracted)',
      'k_відб': 'k_refl',
      'Хвиля r₁ (від S₁)': 'Wave r₁ (from S₁)',
      'Хвиля r₂ (від S₂)': 'Wave r₂ (from S₂)',
      'Білий світловий фронт': 'White wavefront',
      'Червоний (680 нм)': 'Red (680 nm)',
      'Фіолетовий (405 нм)': 'Violet (405 nm)',
      'E (електричне поле)': 'E (electric field)',
      'B (магнітне поле)': 'B (magnetic field)',
      'S = [E × H] (фронт)': 'S = [E × H] (front)',
      'v₁ (широка труба)': 'v₁ (wide pipe)',
      'v₂ (вузьке горло)': 'v₂ (narrow throat)',
      'F_ΔP (перепад тиску)': 'F_ΔP (pressure grad)',
      'Плоский фронт (паралельний)': 'Plane front (parallel)',
      'Збіжний фронт (до F)': 'Converging front (to F)',
      'v (швидкість заряду)': 'v (charge velocity)',
      'F_Л = q[v × B]': 'F_L = q[v × B]',
      'B (однорідне поле)': 'B (uniform field)',
      'v_магн (рух магніту)': 'v_mag (magnet velocity)',
      'B_магн (зовнішнє)': 'B_mag (external)',
      'B_інд (за Ленцом)': 'B_ind (Lenz field)',
      'v (орбітальна)': 'v (orbital)',
      'F_g (тяжіння)': 'F_g (gravity)',
      'v (поступальна)': 'v (linear)',
      'F_тер (спокою)': 'F_f (static)',
      'v_y (пучність)': 'v_y (antinode)',
      'T (натяг струни)': 'T (tension)',
      'v_s (джерело)': 'v_s (source)',
      'c (фронт попереду)': 'c (front ahead)',
      'E₀ (після поляризатора)': 'E₀ (polarized)',
      'E = E₀·cos θ (після аналізатора)': 'E = E₀·cos θ',
      'k₀ (плоский фронт)': 'k₀ (plane front)',
      'θ_m (мінімум)': 'θ_m (minimum)',
      'Q₁ (від нагрівника)': 'Q₁ (from heater)',
      'A = Q₁ − Q₂ (робота)': 'A = Q₁ − Q₂ (work)',
      'Q₂ (у холодильник)': 'Q₂ (to cold sink)',
      'F_Стокса = 6π·ηrv': 'F_Stokes = 6π·ηrv',
      'v (швидкість)': 'v (velocity)',
      'F_Кулона (на q₁)': 'F_Coulomb (on q₁)',
      'F_Кулона (на q₂)': 'F_Coulomb (on q₂)',
      'F₀ = q₀·E (поле)': 'F₀ = q₀·E (field)',
      'E (поле конденсатора)': 'E (capacitor field)',
      'B (магнітне поле L)': 'B (inductor field)',
      'I(t) (струм контуру)': 'I(t) (circuit current)',
      'T₁ (натяг лівої)': 'T₁ (left tension)',
      'T₂ (натяг правої)': 'T₂ (right tension)',
      'm₁g (тягар 1)': 'm₁g (weight 1)',
      'm₂g (тягар 2)': 'm₂g (weight 2)',
      'v_відн (відносна)': 'v_rel (relative)',
      'F_Кор = -2m[ω × v]': 'F_Cor = -2m[ω × v]',
      'ω (кутова платформи)': 'ω (turntable spin)',
      'F (навантаження)': 'F (tensile load)',
      'F_пруж = E·A·ε': 'F_el = E·A·ε',
      'v₁ (верхній отвір)': 'v₁ (upper nozzle)',
      'v₂ (середній отвір)': 'v₂ (middle nozzle)',
      'v₃ (нижній отвір)': 'v₃ (lower nozzle)',
      'v_p (найімовірніша)': 'v_p (most probable)',
      'v_кв (сер.-квадр.)': 'v_rms (root-mean-sq)',
      'k_пад (монохромат.)': 'k_inc (monochromatic)',
      'k₁,₂ (інтерференція)': 'k₁,₂ (interference)',
      'hν (потік фотонів)': 'hν (photon beam)',
      'v_max (фотоелектрони)': 'v_max (photoelectrons)',
      'E_гальм (затримуюче)': 'E_stop (retarding)',
      'v_α (імпульс частинки)': 'v_α (alpha velocity)',
      'F_К (відштовхування ядра)': 'F_C (nuclear repulsion)',
      'F₁₂ (сила Ампера)': 'F₁₂ (Ampere force)',
      'F₂₁ (сила Ампера)': 'F₂₁ (Ampere force)',
      'B (індукція струму)': 'B (wire field)',
      'v_d (дрейф носіїв)': 'v_d (carrier drift)',
      'F_Л (сила Лоренца)': 'F_L (Lorentz force)',
      'E_H (поле Холла)': 'E_H (Hall field)',
      'v₁ (маятник 1)': 'v₁ (pendulum 1)',
      'v₂ (маятник 2)': 'v₂ (pendulum 2)',
      'F_зв (пружина)': 'F_cpl (spring)',
      'L (момент імпульсу)': 'L (angular mom.)',
      'M = [r × mg] (момент)': 'τ = [r × mg] (torque)',
      'Ω_прец (прецесія)': 'Ω_prec (precession)',
      'v_∞ (потік повітря)': 'v_∞ (airflow)',
      'F_Магнуса (підіймальна)': 'F_Magnus (lift)',
      'ω (обертання циліндра)': 'ω (cylinder spin)',
      'F_σ (поверхневий натяг)': 'F_σ (surface tension)',
      'mg (стовпчик рідини)': 'mg (liquid column)',
      'r(t) (зміщення частинки)': 'r(t) (displacement)',
      'v_тепл (удари молекул)': 'v_th (molecular hits)',
      'Промінь 1 (плече L₁)': 'Beam 1 (arm L₁)',
      'Промінь 2 (плече L₂)': 'Beam 2 (arm L₂)',
      'k_інт (до детектора)': 'k_int (to detector)',
      'p_γ (падаючий фотон)': 'p_γ (incident photon)',
      'p_γ′ (розсіяний фотон)': 'p_γ′ (scattered photon)',
      'p_e (віддача електрона)': 'p_e (recoil electron)',
      'v_n (орбітальна e⁻)': 'v_n (orbital e⁻)',
      'F_К (до ядра)': 'F_C (Coulomb)',
      'hν (випромінений фотон)': 'hν (emitted photon)',
      'B₀ (осьове поле)': 'B₀ (axial field)',
      'I (струм котушок)': 'I (coil current)',
      'Φ(t) (магнітний потік)': 'Φ(t) (core flux)',
      'U₁ (первинна обмотка)': 'U₁ (primary)',
      'U₂ (вторинна обмотка)': 'U₂ (secondary)'
    };
    const activeVectorArrows = new Set();

    function drawPillRect(ctx, x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }

    function makeBookVectorSprite(text, borderColor = '#142e46') {
      const displayText = (typeof uiState === 'undefined' || uiState.lang === 'en')
        ? (VECTOR_LABEL_EN[text] || text)
        : text;
      const canvas = document.createElement('canvas');
      canvas.width = 276;
      canvas.height = 88;
      const ctx = canvas.getContext('2d');

      // М'яка тінь у стилі Apple / Google
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      drawPillRect(ctx, 12, 14, 252, 54, 14);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.fill();
      ctx.restore();

      // Тонкий контур капсули
      drawPillRect(ctx, 12, 14, 252, 54, 14);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Кольоровий маркер зліва
      ctx.fillStyle = borderColor;
      drawPillRect(ctx, 22, 27, 7, 28, 3.5);
      ctx.fill();

      ctx.font = '600 24px "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayText, 142, 42);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(1.26, 0.40, 1);
      sprite.renderOrder = 999;
      return sprite;
    }

    function disposeObject3D(obj) {
      if (!obj) return;
      if (obj.children && obj.children.length > 0) {
        for (let i = obj.children.length - 1; i >= 0; i--) {
          disposeObject3D(obj.children[i]);
        }
      }
      if (obj.geometry) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m) continue;
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
      if (obj.parent) {
        obj.parent.remove(obj);
      }
    }

    function clearGroup3D(group) {
      if (!group) return;
      while (group.children.length > 0) {
        disposeObject3D(group.children[0]);
      }
    }

    class SmartVectorArrow {
      constructor(label, colorHex = 0x166534, labelStrColor = '#166534') {
        this.rawLabel = label;
        this.labelStrColor = labelStrColor;
        this.group = new THREE.Group();

        const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 12);
        shaftGeo.translate(0, 0.5, 0);
        const headGeo = new THREE.ConeGeometry(0.115, 0.3, 16);
        headGeo.translate(0, 0.15, 0);

        const mat = new THREE.MeshStandardMaterial({
          color: colorHex,
          roughness: 0.35,
          metalness: 0.15
        });

        this.shaft = new THREE.Mesh(shaftGeo, mat);
        this.head = new THREE.Mesh(headGeo, mat);
        this.group.add(this.shaft);
        this.group.add(this.head);

        this.labelSprite = makeBookVectorSprite(label, labelStrColor);
        scene.add(this.labelSprite);
        worldGroup.add(this.group);
        activeVectorArrows.add(this);
      }

      refreshLanguage() {
        const pos = this.labelSprite.position.clone();
        const vis = this.labelSprite.visible;
        disposeObject3D(this.labelSprite);
        this.labelSprite = makeBookVectorSprite(this.rawLabel, this.labelStrColor);
        this.labelSprite.position.copy(pos);
        this.labelSprite.visible = vis;
        scene.add(this.labelSprite);
      }

      update(origin, dirVector, length, showArrow = true, showLabel = true) {
        if (!showArrow || length < 0.08) {
          this.group.visible = false;
          this.labelSprite.visible = false;
          return;
        }
        this.group.visible = true;
        this.group.position.copy(origin);

        const normDir = dirVector.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normDir);
        this.group.quaternion.copy(quat);

        const shaftLen = Math.max(0.05, length - 0.28);
        this.shaft.scale.set(1, shaftLen, 1);
        this.head.position.set(0, shaftLen, 0);

        this.labelSprite.visible = showLabel;
        if (showLabel) {
          const tipPos = origin.clone().addScaledVector(normDir, length + 0.32);
          this.labelSprite.position.copy(tipPos);
        }
      }

      dispose() {
        activeVectorArrows.delete(this);
        disposeObject3D(this.group);
        disposeObject3D(this.labelSprite);
      }
    }

    class VectorArrow3D extends SmartVectorArrow {
      constructor(colorHex = 0x166534, label = 'v') {
        const hexStr = '#' + colorHex.toString(16).padStart(6, '0');
        super(label, colorHex, hexStr);
      }

      update(origin, dirVector, length, showArrowOrLabel = true, showLabel = true) {
        const showVec = typeof showArrowOrLabel === 'boolean' ? showArrowOrLabel : uiState.showVectors;
        const showLbl = typeof showArrowOrLabel === 'boolean' ? showLabel : uiState.showLabels;
        super.update(origin, dirVector, length, showVec, showLbl);
      }
    }

    class EnergyParticleSystem {
      constructor(maxParticles = 120) {
        const safeMax = (typeof maxParticles === 'number' && maxParticles > 0 && maxParticles <= 300) ? Math.floor(maxParticles) : 100;
        this.max = safeMax;
        this.particles = [];
        this.sharedGeo = new THREE.SphereGeometry(0.055, 8, 8);
        for (let i = 0; i < safeMax; i++) {
          const mat = new THREE.MeshBasicMaterial({
            color: 0xb45309,
            transparent: true,
            opacity: 0
          });
          const mesh = new THREE.Mesh(this.sharedGeo, mat);
          mesh.visible = false;
          worldGroup.add(mesh);
          this.particles.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
        }
        this.cursor = 0;
      }

      emit(pos, velocitySpread = 2.0, count = 4, colorHex = 0xb45309) {
        if (!uiState.showParticles || !this.particles.length) return;
        for (let i = 0; i < count; i++) {
          const p = this.particles[this.cursor];
          this.cursor = (this.cursor + 1) % this.max;
          p.mesh.position.copy(pos);
          p.mesh.material.color.setHex(colorHex);
          p.mesh.material.opacity = 0.9;
          p.mesh.scale.setScalar(1);
          p.mesh.visible = true;
          p.vel.set(
            (Math.random() - 0.5) * velocitySpread,
            Math.random() * velocitySpread * 0.75 + 0.35,
            (Math.random() - 0.5) * velocitySpread
          );
          p.life = 0;
          p.maxLife = 0.4 + Math.random() * 0.4;
        }
      }

      update(dt) {
        for (const p of this.particles) {
          if (!p.mesh.visible) continue;
          p.life += dt;
          if (p.life >= p.maxLife) {
            p.mesh.visible = false;
            continue;
          }
          p.mesh.position.addScaledVector(p.vel, dt);
          const ratio = 1 - p.life / p.maxLife;
          p.mesh.material.opacity = ratio * 0.85;
          p.mesh.scale.setScalar(0.35 + ratio * 0.75);
        }
      }

      clear() {
        for (const p of this.particles) p.mesh.visible = false;
      }

      dispose() {
        for (const p of this.particles) {
          if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
          if (p.mesh.material) p.mesh.material.dispose();
        }
        if (this.sharedGeo) this.sharedGeo.dispose();
        this.particles = [];
      }
    }

    // ============================================================================
    // 3. ЗМІСТ ПІДРУЧНИКА: 12 ПАРАГРАФІВ З АКАДЕМІЧНИМИ ФОРМУЛАМИ KaTeX
    // ============================================================================
    const uiState = {
      lang: 'en',
      activeScene: 'wavefront',
      phase: 'predict',
      running: false,
      timeScale: 1.0,
      simTime: 0,
      selectedOption: null,
      showVectors: true,
      showLabels: true,
      showTrails: true,
      showParticles: true,
      autoOrbit: false,
      dropdownFilter: 'all'
    };

    const chartHistory = {
      ek: [],
      ep: [],
      q: [],
      maxPoints: 150
    };

    function resetChartHistory() {
      chartHistory.ek.length = 0;
      chartHistory.ep.length = 0;
      chartHistory.q.length = 0;
    }

    // Допоміжна функція перетворення довжини світлової хвилі λ (нм) у спектральний колір RGB
    function wavelengthToColor(nm) {
      let r = 0, g = 0, b = 0;
      if (nm >= 380 && nm < 440) {
        r = -(nm - 440) / (440 - 380);
        g = 0.0;
        b = 1.0;
      } else if (nm >= 440 && nm < 490) {
        r = 0.0;
        g = (nm - 440) / (490 - 440);
        b = 1.0;
      } else if (nm >= 490 && nm < 510) {
        r = 0.0;
        g = 1.0;
        b = -(nm - 510) / (510 - 490);
      } else if (nm >= 510 && nm < 580) {
        r = (nm - 510) / (580 - 510);
        g = 1.0;
        b = 0.0;
      } else if (nm >= 580 && nm < 645) {
        r = 1.0;
        g = -(nm - 645) / (645 - 580);
        b = 0.0;
      } else if (nm >= 645 && nm <= 750) {
        r = 1.0;
        g = 0.0;
        b = 0.0;
      }
      // Трохи приглушуємо до благородного книжкового тону, зберігаючи насиченість спектра
      const col = new THREE.Color(r * 0.88 + 0.05, g * 0.82 + 0.05, b * 0.88 + 0.05);
      return col;
    }

    const SCENE_CONFIGS = {
      collision: {
        secSym: '§ 1.',
        shortTitle: 'Закон збереження імпульсу',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та коливання',
        badge: 'Удари тіл',
        subtitle: 'Пружне та непружне зіткнення куль, обмін імпульсами',
        secTag: 'Параграф § 1 — Механіка зіткнень',
        title: 'Закон збереження імпульсу',
        epigraph: 'У замкненій механічній системі векторна сума імпульсів усіх тіл залишається сталою за будь-яких взаємодій між ними.',
        figCaption: 'Рис. 1.1 — Перерозподіл кінетичної енергії під час зіткнення двох куль',
        ekLabel: 'Кінет. E_k',
        epLabel: 'Деформ. E_p',
        qLabel: 'Тепло Q',
        cameraPos: [0, 5.6, 14.5],
        cameraTarget: [0, 1.0, 0],
        referenceLatex: String.raw`\begin{aligned}
          \vec{p}_1 + \vec{p}_2 &= \vec{p}_1' + \vec{p}_2' = \text{const} \\
          v_1' &= \frac{(m_1 - e m_2)v_1 + (1+e)m_2 v_2}{m_1 + m_2}
        \end{aligned}`,
        question: 'Куля масою $m_1 = 2\\text{ кг}$ рухається зі швидкістю $v_1 = 4\\text{ м/с}$ і абсолютно пружно ($e = 1$) центрально вдаряє нерухому кулю такої самої маси $m_2 = 2\\text{ кг}$. Якими будуть швидкості куль після удару?',
        options: [
          'Обидві кулі рухатимуться разом зі швидкістю $u = 2\\text{ м/с}$',
          'Перша куля зупиниться ($v_1\' = 0$), а друга отримає всю її швидкість ($v_2\' = 4\\text{ м/с}$)',
          'Перша куля відскочить назад зі швидкістю $-4\\text{ м/с}$, а друга залишиться на місці'
        ],
        correctIndex: 1,
        explanation: 'Згідно із законами збереження імпульсу та механічної енергії, при центральному абсолютно пружному зіткненні ($e=1$) двох куль однакової маси ($m_1 = m_2$) відбувається повний обмін швидкостями. Якщо ж удар непружний ($e < 1$), частина кінетичної енергії переходить у внутрішню теплову енергію $\\Delta Q = \\frac{1}{2}\\mu_{\\text{зв}} v_{\\text{відн}}^2 (1 - e^2)$.',
        formulaLatex: String.raw`v_1' = \frac{(m_1 - e m_2)v_1 + (1+e)m_2 v_2}{m_1 + m_2}, \quad v_2' = \frac{(m_2 - e m_1)v_2 + (1+e)m_1 v_1}{m_1 + m_2}`,
        liveLatexFn: p => {
          const v1p = ((p.m1 - p.restitution * p.m2) * p.v1 + (1 + p.restitution) * p.m2 * p.v2) / (p.m1 + p.m2);
          const v2p = ((p.m2 - p.restitution * p.m1) * p.v2 + (1 + p.restitution) * p.m1 * p.v1) / (p.m1 + p.m2);
          return String.raw`v_1' = ${v1p.toFixed(2)}\text{ м/с}, \quad v_2' = ${v2p.toFixed(2)}\text{ м/с}`;
        },
        defaults: { m1: 2.0, m2: 2.0, v1: 4.0, v2: 0.0, restitution: 1.0, impactOffset: 0.0 },
        sliders: [
          { key: 'm1', label: 'Маса першої кулі m₁', min: 0.5, max: 6.0, step: 0.5, unit: 'кг' },
          { key: 'm2', label: 'Маса другої кулі m₂', min: 0.5, max: 6.0, step: 0.5, unit: 'кг' },
          { key: 'v1', label: 'Початкова швидкість v₁', min: 1.0, max: 8.0, step: 0.5, unit: 'м/с' },
          { key: 'v2', label: 'Початкова швидкість v₂', min: -4.0, max: 3.0, step: 0.5, unit: 'м/с' },
          { key: 'restitution', label: 'Коефіцієнт відновлення e', min: 0.0, max: 1.0, step: 0.05, unit: '' },
          { key: 'impactOffset', label: 'Прицільний параметр Δz', min: -0.6, max: 0.6, step: 0.05, unit: 'м' }
        ]
      },

      incline: {
        secSym: '§ 2.',
        shortTitle: 'Рух по похилій площині',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та коливання',
        badge: 'Динаміка',
        subtitle: 'Розклад сили тяжіння, реакція опори N та кут тертя',
        secTag: 'Параграф § 2 — Динаміка матеріальної точки',
        title: 'Рух тіла по похилій площині',
        epigraph: 'Розкладання сили тяжіння на взаємно перпендикулярні осі дозволяє визначити умову рівноваги та прискорення тіла на схилі.',
        figCaption: 'Рис. 2.1 — Перехід потенціальної енергії mgh у кінетичну та теплоту тертя',
        ekLabel: 'Кінет. E_k',
        epLabel: 'Потенц. mgh',
        qLabel: 'Робота тертя Q',
        cameraPos: [0, 6.0, 14.5],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          m\vec{a} &= m\vec{g} + \vec{N} + \vec{F}_{\text{тер}} \\
          a &= g(\sin\alpha - \mu\cos\alpha), \quad N = mg\cos\alpha
        \end{aligned}`,
        question: 'Брусок лежить на похилій площині з кутом нахилу $\\alpha = 30^\\circ$ та коефіцієнтом тертя ковзання $\\mu = 0.25$. За якої умови брусок почне самовільно зісковзувати вниз?',
        options: [
          'Тільки якщо маса бруска $m$ перевищить критичне значення $5\\text{ кг}$',
          'Коли скачуюча складова перевищить граничну силу тертя спокою: $\\tan\\alpha > \\mu$',
          'Коли нормальна реакція опори $N = mg\\cos\\alpha$ стане більшою за $mg$'
        ],
        correctIndex: 1,
        explanation: 'У нерівності $mg\\sin\\alpha > \\mu mg\\cos\\alpha$ маса тіла $m$ скорочується! Отже, умова початку руху визначається виключно кутом нахилу та коефіцієнтом тертя: $\\tan\\alpha > \\mu$ (кут нахилу має перевищити кут тертя $\\varphi = \\arctan\\mu$).',
        formulaLatex: String.raw`a = g(\sin\alpha - \mu\cos\alpha), \quad F_{\text{тер}} = \mu mg\cos\alpha, \quad \tan\alpha > \mu`,
        liveLatexFn: p => {
          const rad = (p.angle * Math.PI) / 180;
          const acc = Math.max(0, p.gravity * (Math.sin(rad) - p.mu * Math.cos(rad)));
          return String.raw`\tan(${p.angle}^\circ) = ${Math.tan(rad).toFixed(2)}, \quad \mu = ${p.mu.toFixed(2)} \implies a = ${acc.toFixed(2)}\text{ м/с}^2`;
        },
        defaults: { angle: 30, mu: 0.25, mass: 2.5, gravity: 9.81 },
        sliders: [
          { key: 'angle', label: 'Кут нахилу площини α', min: 5, max: 55, step: 1, unit: '°' },
          { key: 'mu', label: 'Коефіцієнт тертя μ', min: 0.0, max: 0.85, step: 0.05, unit: '' },
          { key: 'mass', label: 'Маса бруска m', min: 0.5, max: 6.0, step: 0.5, unit: 'кг' },
          { key: 'gravity', label: 'Прискорення тяжіння g', min: 1.6, max: 15.0, step: 0.1, unit: 'м/с²' }
        ]
      },

      pendulum: {
        secSym: '§ 3.',
        shortTitle: 'Математичний і пружинний маятники',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та коливання',
        badge: 'Коливання',
        subtitle: 'Порівняння періодів T = 2π√(L/g) та T = 2π√(m/k)',
        secTag: 'Параграф § 3 — Механічні коливання',
        title: 'Математичний та пружинний маятники',
        epigraph: 'Гармонічні коливання супроводжуються періодичним перетворенням потенціальної енергії зміщення у кінетичну енергію руху.',
        figCaption: 'Рис. 3.1 — Протифазні коливання кінетичної та потенціальної енергії',
        ekLabel: 'Кінет. E_k',
        epLabel: 'Потенц. E_p',
        qLabel: 'Дисипація Q',
        cameraPos: [0, 5.2, 13.5],
        cameraTarget: [0, 3.0, 0],
        referenceLatex: String.raw`\begin{aligned}
          T_{\text{мат}} &= 2\pi\sqrt{\frac{L}{g}}, \qquad T_{\text{пруж}} = 2\pi\sqrt{\frac{m}{k}} \\
          E &= \frac{mv^2}{2} + mgL(1-\cos\theta) = \text{const}
        \end{aligned}`,
        question: 'Як зміниться період малих коливань математичного маятника $T_{\\text{мат}}$ та пружинного маятника $T_{\\text{пруж}}$, якщо масу вантажу $m$ збільшити в $4$ рази?',
        options: [
          'Період обох маятників збільшиться рівно у $2$ рази',
          'Період математичного маятника не зміниться, а пружинного — зросте у $2$ рази',
          'Період математичного зросте у $2$ рази, а пружинного не зміниться'
        ],
        correctIndex: 1,
        explanation: 'Для математичного маятника сила тяжіння й інертність пропорційні масі $m$, тому $T_{\\text{мат}} = 2\\pi\\sqrt{L/g}$ не залежить від маси! Натомість у пружинному маятнику повертаюча сила Гука $F = -kx$ від маси не залежить, тому при збільшенні $m$ у $4$ рази період $T_{\\text{пруж}} = 2\\pi\\sqrt{m/k}$ зростає вдвічі.',
        formulaLatex: String.raw`\ddot{\theta} + 2\gamma\dot{\theta} + \frac{g}{L}\sin\theta = 0, \qquad \ddot{y} + 2\gamma\dot{y} + \frac{k}{m}y = 0`,
        liveLatexFn: p => {
          const tm = 2 * Math.PI * Math.sqrt(p.length / p.gravity);
          const ts = 2 * Math.PI * Math.sqrt(p.mass / p.stiffness);
          return String.raw`T_{\text{мат}} = ${tm.toFixed(2)}\text{ с}, \qquad T_{\text{пруж}} = ${ts.toFixed(2)}\text{ с}`;
        },
        defaults: { length: 3.5, theta0: 35, mass: 2.0, stiffness: 14.0, damping: 0.02, gravity: 9.81 },
        sliders: [
          { key: 'length', label: 'Довжина нитки L', min: 1.8, max: 4.8, step: 0.1, unit: 'м' },
          { key: 'theta0', label: 'Початкова амплітуда θ₀', min: 10, max: 75, step: 5, unit: '°' },
          { key: 'mass', label: 'Маса вантажу m', min: 0.5, max: 5.0, step: 0.5, unit: 'кг' },
          { key: 'stiffness', label: 'Жорсткість пружини k', min: 5.0, max: 35.0, step: 1.0, unit: 'Н/м' },
          { key: 'damping', label: 'Коефіцієнт загасання γ', min: 0.0, max: 0.25, step: 0.01, unit: 'с⁻¹' }
        ]
      },

      projectile: {
        secSym: '§ 4.',
        shortTitle: 'Балістика: Тіло під кутом до горизонту',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та коливання',
        badge: 'Кінематика',
        subtitle: 'Парабола у вакуумі та балістична крива з опором повітря',
        secTag: 'Параграф § 4 — Кінематика криволінійного руху',
        title: 'Рух тіла, кинутого під кутом до горизонту',
        epigraph: 'Балістичний рух у полі тяжіння є суперпозицією рівномірного руху вздовж горизонтальної осі Ox та рівноприскореного вздовж вертикальної осі Oy.',
        figCaption: 'Рис. 4.1 — Баланс кінетичної та потенціальної енергії вздовж параболи',
        ekLabel: 'Кінет. E_k',
        epLabel: 'Потенц. mgh',
        qLabel: 'Опір повітря Q',
        cameraPos: [1.5, 5.8, 17.5],
        cameraTarget: [1.5, 2.4, 0],
        referenceLatex: String.raw`\begin{aligned}
          x(t) &= v_0\cos\theta\cdot t, \quad y(t) = h_0 + v_0\sin\theta\cdot t - \frac{gt^2}{2} \\
          H_{\max} &= h_0 + \frac{v_0^2\sin^2\theta}{2g}, \quad L = \frac{v_0^2\sin 2\theta}{g}
        \end{aligned}`,
        question: 'Тіло кинуто під кутом $\\theta = 45^\\circ$ до горизонту у вакуумі ($c_d = 0$). Яке значення має кінетична енергія тіла $E_k$ у найвищій точці траєкторії порівняно з початковою $E_{k0} = \\frac{1}{2}mv_0^2$?',
        options: [
          'У верхній точці $E_k = 0$, оскільки тіло миттєво зупиняється',
          'У верхній точці $v_y = 0$, але $v_x = v_0\\cos 45^\\circ$, тому $E_k = E_{k0}\\cos^2 45^\\circ = \\frac{1}{2}E_{k0}$',
          'Кінетична енергія у верхній точці дорівнює початковій $E_{k0}$'
        ],
        correctIndex: 1,
        explanation: 'У вершині параболи зникає лише вертикальна складова швидкості ($v_y = 0$), а горизонтальна складова $v_x = v_0\\cos\\theta$ залишається незмінною. Тому кінетична енергія у вершині становить $E_{k,\\min} = \\frac{1}{2}m(v_0\\cos\\theta)^2 = E_{k0}\\cos^2\\theta$.',
        formulaLatex: String.raw`v_{\text{верш}} = v_x = v_0\cos\theta, \qquad E_{k,\min} = E_{k0}\cos^2\theta`,
        liveLatexFn: p => {
          const rad = (p.angle * Math.PI) / 180;
          const vx = p.v0 * Math.cos(rad);
          const hmax = p.h0 + Math.pow(p.v0 * Math.sin(rad), 2) / (2 * p.gravity);
          return String.raw`v_x = ${vx.toFixed(2)}\text{ м/с}, \qquad H_{\max}^{\text{теор}} = ${hmax.toFixed(2)}\text{ м}`;
        },
        defaults: { v0: 11.5, angle: 45, h0: 1.2, drag: 0.0, mass: 1.5, gravity: 9.81 },
        sliders: [
          { key: 'v0', label: 'Початкова швидкість v₀', min: 6.0, max: 15.0, step: 0.5, unit: 'м/с' },
          { key: 'angle', label: 'Кут кидання θ', min: 15, max: 80, step: 1, unit: '°' },
          { key: 'h0', label: 'Початкова висота h₀', min: 0.2, max: 4.5, step: 0.2, unit: 'м' },
          { key: 'drag', label: 'Коефіцієнт опору повітря c_d', min: 0.0, max: 0.15, step: 0.01, unit: 'кг/м' },
          { key: 'mass', label: 'Маса тіла m', min: 0.5, max: 5.0, step: 0.5, unit: 'кг' }
        ]
      },

      cradle: {
        secSym: '§ 5.',
        shortTitle: 'Колиска Ньютона',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та коливання',
        badge: 'Каскад ударів',
        subtitle: 'Передача імпульсу та енергії ланцюжком сталевих куль',
        secTag: 'Параграф § 5 — Каскадні пружні зіткнення',
        title: 'Колиска Ньютона',
        epigraph: 'Одночасне виконання законів збереження імпульсу та механічної енергії однозначно визначає не лише сумарний імпульс, а й кількість куль, що відскакують.',
        figCaption: 'Рис. 5.1 — Передача хвилі імпульсу крізь ланцюжок сталевих куль',
        ekLabel: 'Кінет. E_k',
        epLabel: 'Потенц. E_p',
        qLabel: 'Втрати Q',
        cameraPos: [0, 4.8, 12.5],
        cameraTarget: [0, 2.6, 0],
        referenceLatex: String.raw`\begin{cases}
          N_{\text{до}} m v = N_{\text{після}} m u \\
          N_{\text{до}} \dfrac{mv^2}{2} = N_{\text{після}} \dfrac{mu^2}{2}
        \end{cases} \implies N_{\text{після}} = N_{\text{до}}, \; u = v`,
        question: 'У колисці Ньютона з $5$ однакових сталевих куль ліворуч відвели і відпустили одночасно $N = 2$ кулі зі швидкістю $v$. Чому з правого краю не може відскочити лише $1$ куля з подвійною швидкістю $2v$?',
        options: [
          'Тому що тоді порушився б закон збереження імпульсу ($2mv \\neq m(2v)$)',
          'Імпульс би зберігся ($2mv = m\\cdot 2v$), але кінетична енергія зросла б удвічі ($\\frac{1}{2}m(2v)^2 = 2mv^2 > mv^2$), що неможливо!',
          'Тому що крайня куля має більший натяг нитки, ніж середні кулі'
        ],
        correctIndex: 1,
        explanation: 'Якби відскочила одна куля зі швидкістю $2v$, її імпульс дорівнював би $2mv$ (імпульс збережено), проте кінетична енергія становила б $\\frac{1}{2}m(2v)^2 = 2mv^2$, тоді як до удару енергія двох куль дорівнювала $2\\cdot\\frac{1}{2}mv^2 = mv^2$. Єдиний розв’язок системи рівнянь — відскік рівно $N_{\\text{після}} = N_{\\text{до}}$ куль зі швидкістю $u = v$!',
        formulaLatex: String.raw`N_{\text{після}} = N_{\text{до}}, \qquad u = v \quad (\text{при } e = 1)`,
        liveLatexFn: p => {
          return String.raw`N_{\text{активних}} = ${p.liftedBalls}, \qquad \theta_0 = ${p.theta0}^\circ, \qquad e = ${p.restitution.toFixed(2)}`;
        },
        defaults: { liftedBalls: 2, theta0: 40, restitution: 0.99, length: 3.4 },
        sliders: [
          { key: 'liftedBalls', label: 'Кількість відведених куль N', min: 1, max: 3, step: 1, unit: 'шт' },
          { key: 'theta0', label: 'Кут відведення θ₀', min: 15, max: 55, step: 5, unit: '°' },
          { key: 'restitution', label: 'Коефіцієнт пружності сталі e', min: 0.7, max: 1.0, step: 0.01, unit: '' },
          { key: 'length', label: 'Довжина підвісу L', min: 2.4, max: 4.2, step: 0.2, unit: 'м' }
        ]
      },

      centripetal: {
        secSym: '§ 6.',
        shortTitle: 'Рух по колу та доцентрова сила',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та коливання',
        badge: 'Обертання',
        subtitle: 'Доцентрове прискорення a = ω²R та умова зриву в занос',
        secTag: 'Параграф § 6 — Динаміка руху по колу',
        title: 'Доцентрове прискорення та рух на повороті',
        epigraph: 'Будь-який криволінійний рух є прискореним: вектор швидкості змінює свій напрямок завдяки доцентровій силі, спрямованій до центра кривизни.',
        figCaption: 'Рис. 6.1 — Співвідношення необхідної доцентрової сили та граничного тертя',
        ekLabel: 'Кінет. E_k',
        epLabel: 'Запас тертя',
        qLabel: 'Ковзання Q',
        cameraPos: [0, 9.0, 12.0],
        cameraTarget: [0, 0.8, 0],
        referenceLatex: String.raw`\begin{aligned}
          a_{\text{дц}} &= \frac{v^2}{R} = \omega^2 R, \qquad F_{\text{дц}} = m\omega^2 R \\
          \omega_{\text{кр}} &= \sqrt{\frac{\mu g}{R}} \quad (\text{умова безковзного обертання})
        \end{aligned}`,
        question: 'Тіло лежить на горизонтальному диску на відстані $R$ від осі обертання. Як зміниться доцентрове прискорення $a_{\\text{дц}} = \\omega^2 R$, якщо кутову швидкість диска $\\omega$ збільшити вдвічі?',
        options: [
          'Доцентрове прискорення та необхідна сила тертя зростуть у $4$ рази',
          'Доцентрове прискорення не зміниться, бо радіус $R$ сталий',
          'Доцентрове прискорення зменшиться вдвічі'
        ],
        correctIndex: 0,
        explanation: 'Оскільки $a_{\\text{дц}} = \\omega^2 R = v^2 / R$, збільшення кутової швидкості $\\omega$ вдвічі призводить до чотирикратного зростання доцентрового прискорення. Коли необхідна доцентрова сила $m\\omega^2 R$ перевищує максимальну силу тертя спокою $\\mu mg$, тіло зривається у радіальне ковзання!',
        formulaLatex: String.raw`m\omega^2 R \le \mu mg \implies \omega \le \omega_{\text{кр}} = \sqrt{\frac{\mu g}{R}}`,
        liveLatexFn: p => {
          const fReq = p.mass * p.omega * p.omega * p.radius;
          const fMax = p.mu * p.mass * 9.81;
          const status = fReq <= fMax ? '\\text{Утримується}' : '\\text{Зрив у занос!}';
          return String.raw`F_{\text{дц}} = ${fReq.toFixed(1)}\text{ Н}, \quad F_{\text{тер},\max} = ${fMax.toFixed(1)}\text{ Н} \; (${status})`;
        },
        defaults: { omega: 1.8, radius: 2.6, mu: 0.45, mass: 2.0 },
        sliders: [
          { key: 'omega', label: 'Кутова швидкість диска ω', min: 0.5, max: 3.5, step: 0.1, unit: 'рад/с' },
          { key: 'radius', label: 'Радіус орбіти R', min: 1.2, max: 4.2, step: 0.2, unit: 'м' },
          { key: 'mu', label: 'Коефіцієнт тертя спокою μ', min: 0.1, max: 0.9, step: 0.05, unit: '' },
          { key: 'mass', label: 'Маса тіла m', min: 0.5, max: 5.0, step: 0.5, unit: 'кг' }
        ]
      },

      archimedes: {
        secSym: '§ 7.',
        shortTitle: 'Закон Архімеда та плавання тіл',
        category: 'thermo',
        categoryGroupTitle: 'Розділ ІІ. Гідростатика та молекулярно-кінетична теорія',
        badge: 'Гідростатика',
        subtitle: 'Виштовхувальна сила F_A = ρgV та умова плавання біля ватерлінії',
        secTag: 'Параграф § 7 — Статика рідин та газів',
        title: 'Закон Архімеда та умови плавання тіл',
        epigraph: 'На тіло, занурене в рідину або газ, діє виштовхувальна сила, що дорівнює вазі рідини в об’ємі зануреної частини тіла.',
        figCaption: 'Рис. 7.1 — Затухаючі коливання тіла поблизу ватерлінії рівноваги',
        ekLabel: 'Кінет. E_k',
        epLabel: 'Гідростат. E_p',
        qLabel: 'В’язкість Q',
        cameraPos: [0, 4.5, 11.5],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          F_{\text{А}} &= \rho_{\text{рідини}} g V_{\text{зан}}, \qquad F_g = \rho_{\text{тіла}} g V_0 \\
          \frac{V_{\text{зан}}}{V_0} &= \frac{\rho_{\text{тіла}}}{\rho_{\text{рідини}}} \quad (\text{при } \rho_{\text{тіла}} \le \rho_{\text{рідини}})
        \end{aligned}`,
        question: 'Суцільний куб із густиною $\\rho_{\\text{тіла}} = 600\\text{ кг/м}^3$ опускають у прісну воду ($\\rho_{\\text{води}} = 1000\\text{ кг/м}^3$). Яка частка об’єму куба опиниться під водою у стані рівноваги?',
        options: [
          'Рівно половина об’єму ($50\\%$) незалежно від густини тіла',
          'Частка зануреного об’єму дорівнює відношенню густин: $\\rho_{\\text{тіла}}/\\rho_{\\text{води}} = 60\\%$',
          'Куб повністю потоне на дно посудини ($100\\%$)'
        ],
        correctIndex: 1,
        explanation: 'У стані рівноваги плаваючого тіла сила тяжіння врівноважується силою Архімеда: $\\rho_{\\text{тіла}} g V_0 = \\rho_{\\text{рідини}} g V_{\\text{зан}}$. Звідси частка зануреної частини становить $V_{\\text{зан}}/V_0 = \\rho_{\\text{тіла}}/\\rho_{\\text{рідини}} = 600/1000 = 0.6$ ($60\\%$). Якщо $\\rho_{\\text{тіла}} > \\rho_{\\text{рідини}}$, тіло тоне.',
        formulaLatex: String.raw`\rho_{\text{тіла}} g V_0 = \rho_{\text{рідини}} g V_{\text{зан}} \implies \frac{h_{\text{зан}}}{H} = \frac{\rho_{\text{тіла}}}{\rho_{\text{рідини}}}`,
        liveLatexFn: p => {
          const ratio = Math.min(1, p.rhoBody / p.rhoFluid) * 100;
          const state = p.rhoBody < p.rhoFluid ? '\\text{Плаває}' : p.rhoBody === p.rhoFluid ? '\\text{Байдужа рівновага}' : '\\text{Тоне}';
          return String.raw`\frac{V_{\text{зан}}}{V_0} = ${ratio.toFixed(0)}\% \quad (${state})`;
        },
        defaults: { rhoBody: 600, rhoFluid: 1000, volume: 1.0, viscosity: 0.35 },
        sliders: [
          { key: 'rhoBody', label: 'Густина тіла ρ_тіла', min: 200, max: 1800, step: 50, unit: 'кг/м³' },
          { key: 'rhoFluid', label: 'Густина рідини ρ_рідини', min: 700, max: 2000, step: 50, unit: 'кг/м³' },
          { key: 'volume', label: 'Лінійний розмір куба a', min: 0.8, max: 1.6, step: 0.1, unit: 'м' },
          { key: 'viscosity', label: 'В’язкість середовища η', min: 0.1, max: 1.2, step: 0.05, unit: 'Па·с' }
        ]
      },

      gas: {
        secSym: '§ 8.',
        shortTitle: 'Ідеальний газ під поршнем (МКТ)',
        category: 'thermo',
        categoryGroupTitle: 'Розділ ІІ. Гідростатика та молекулярно-кінетична теорія',
        badge: 'Термодинаміка',
        subtitle: 'Рівняння Менделєєва — Клапейрона PV = νRT та тепловий рух молекул',
        secTag: 'Параграф § 8 — Молекулярно-кінетична теорія',
        title: 'Ідеальний газ під поршнем (Рівняння Менделєєва — Клапейрона)',
        epigraph: 'Тиск газу на стінки посудини та поршень зумовлений сумарним імпульсом незліченних пружних ударів молекул, що перебувають у хаотичному тепловому русі.',
        figCaption: 'Рис. 8.1 — Внутрішня енергія U та робота газу A при зміні температури',
        ekLabel: 'Внутр. U (E_k)',
        epLabel: 'Робота поршня A',
        qLabel: 'Теплообмін Q',
        cameraPos: [0, 4.6, 11.8],
        cameraTarget: [0, 2.4, 0],
        referenceLatex: String.raw`\begin{aligned}
          P V &= \nu R T, \qquad P = \frac{1}{3} n m_0 \overline{v^2} \\
          \overline{E}_k &= \frac{3}{2} k_B T, \qquad Q = \Delta U + P\Delta V
        \end{aligned}`,
        question: 'Ідеальний газ міститься у вертикальному циліндрі під важким рухомим поршнем постійної маси ($P = P_0 + Mg/S = \\text{const}$). Як зміниться об’єм газу $V$ та середня квадратична швидкість молекул при нагріванні абсолютного значення температури $T$ у $2$ рази?',
        options: [
          'Об’єм $V$ не зміниться, а тиск зросте вдвічі',
          'За законом Гей-Люссака ($P = \\text{const}$) об’єм $V$ зросте вдвічі, а швидкість молекул $v_{\\text{кв}} \\propto \\sqrt{T}$ зросте у $\\sqrt{2}$ раза',
          'Молекули зупиняться поблизу верхньої межі поршня'
        ],
        correctIndex: 1,
        explanation: 'При вільному переміщенні поршня постійної маси процес є ізобарним ($P = \\text{const}$). З рівняння Клапейрона $V/T = \\text{const}$ випливає, що нагрівання газу пропорційно піднімає поршень ($V \\propto T$), а середня кінетична енергія поступального руху молекул зростає за законом $\\overline{E}_k = \\frac{3}{2}k_B T$.',
        formulaLatex: String.raw`\frac{V}{T} = \frac{\nu R}{P} = \text{const}, \qquad v_{\text{кв}} = \sqrt{\frac{3RT}{M}}`,
        liveLatexFn: p => {
          const rawVol = (p.temperature / 300) * (1.5 / p.pistonLoad) * 2.4;
          return String.raw`T = ${p.temperature}\text{ К}, \quad P = ${p.pistonLoad.toFixed(1)}\text{ атм}, \quad V = ${rawVol.toFixed(2)}\text{ л}`;
        },
        defaults: { temperature: 300, pistonLoad: 1.5, particleCount: 45 },
        sliders: [
          { key: 'temperature', label: 'Абсолютна температура T', min: 150, max: 600, step: 25, unit: 'К' },
          { key: 'pistonLoad', label: 'Зовнішній тиск на поршень P', min: 0.8, max: 3.0, step: 0.2, unit: 'атм' },
          { key: 'particleCount', label: 'Кількість модельних частинок N', min: 20, max: 70, step: 5, unit: 'мол' }
        ]
      },

      wavefront: {
        secSym: '§ 9.',
        shortTitle: 'Світловий фронт і принцип Гюйгенса',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Світлові явища, хвильовий фронт та оптика',
        badge: 'Світловий фронт',
        subtitle: 'Вторинні сферичні хвилі Гюйгенса та заломлення плоского фронту світла',
        secTag: 'Параграф § 9 — Хвильова оптика та світловий фронт',
        title: 'Світловий фронт і принцип Гюйгенса — Френеля',
        epigraph: 'Кожна точка середовища, до якої дійшов світловий фронт, стає джерелом вторинних напівсферичних хвиль, а їхня огинаюча утворює новий хвильовий фронт.',
        figCaption: 'Рис. 9.1 — Потік світлової енергії: падаючий, заломлений та відбитий фронти',
        ekLabel: 'Заломл. потік T',
        epLabel: 'Відбит. потік R',
        qLabel: 'Фазовий зсув',
        cameraPos: [0, 7.2, 13.8],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          \frac{\sin\alpha}{\sin\gamma} &= \frac{v_1}{v_2} = \frac{n_2}{n_1}, \qquad v = \frac{c}{n} \\
          \lambda_2 &= \frac{\lambda_0}{n_2}, \qquad \Phi(\vec{r}, t) = \vec{k}\cdot\vec{r} - \omega t = \text{const}
        \end{aligned}`,
        question: 'Плоский світловий фронт переходить із повітря ($n_1 = 1.0$) в оптично густіше скло ($n_2 = 1.5$) під кутом падіння $\\alpha > 0$. Чому площина світлового фронту повертається до нормалі ($\\gamma < \\alpha$)?',
        options: [
          'Тому що частота світла $\\nu$ у склі збільшується в $1.5$ раза',
          'Тому що вторинні сферичні хвилі Гюйгенса у склі поширюються повільніше ($v_2 = c/n_2 < c$) і крок між фронтами $\\lambda_2 = \\lambda_0/n_2$ стискається',
          'Тому що світловий фронт прискорюється всередині скла ($v_2 > c$)'
        ],
        correctIndex: 1,
        explanation: 'Згідно з принципом Гюйгенса, коли похилий світловий фронт досягає межі поділу, його лівий край входить у скло раніше й породжує вторинні напівсферичні хвилі, що поширюються з меншою фазовою швидкістю $v_2 = c/n_2$. Поки правий край фронту проходить у повітрі шлях $v_1 \\Delta t$, лівий проходить у склі лише $v_2 \\Delta t$, через що огинаюча поверхня повертається так, що $\\sin\\alpha / \\sin\\gamma = v_1 / v_2 = n_2 / n_1$.',
        formulaLatex: String.raw`n_1\sin\alpha = n_2\sin\gamma, \qquad v_2 = \frac{c}{n_2}, \qquad \lambda_2 = \frac{\lambda_0}{n_2}`,
        liveLatexFn: p => {
          const radA = (p.angle * Math.PI) / 180;
          const sinG = Math.sin(radA) / p.n2;
          const degG = (Math.asin(Math.min(1, sinG)) * 180) / Math.PI;
          const v2 = 300 / p.n2;
          return String.raw`\alpha = ${p.angle}^\circ \implies \gamma = ${degG.toFixed(1)}^\circ, \quad v_2 = ${v2.toFixed(0)}\text{ тис. км/с}, \quad \lambda_2 = ${(p.wavelength / p.n2).toFixed(0)}\text{ нм}`;
        },
        defaults: { angle: 45, n2: 1.55, wavelength: 540, waveletCount: 5 },
        sliders: [
          { key: 'angle', label: 'Кут падіння фронту α', min: 10, max: 75, step: 5, unit: '°' },
          { key: 'n2', label: 'Показник заломлення середовища n₂', min: 1.15, max: 2.4, step: 0.05, unit: '' },
          { key: 'wavelength', label: 'Довжина світлової хвилі λ₀', min: 400, max: 700, step: 15, unit: 'нм' },
          { key: 'waveletCount', label: 'Вторинні центри Гюйгенса N', min: 3, max: 7, step: 1, unit: 'джерел' }
        ]
      },

      interference: {
        secSym: '§ 10.',
        shortTitle: 'Інтерференція світла (Дослід Юнга)',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Світлові явища, хвильовий фронт та оптика',
        badge: 'Когерентність',
        subtitle: 'Накладання двох сферичних світлових фронтів, максимуми та мінімуми',
        secTag: 'Параграф § 10 — Когерентні світлові хвилі',
        title: 'Інтерференція світлових фронтів (Дослід Юнга)',
        epigraph: 'При накладанні двох когерентних світлових хвиль просторовий розподіл інтенсивності визначається різницею фаз між їхніми хвильовими фронтами.',
        figCaption: 'Рис. 10.1 — Інтенсивність світла у вибраній точці екрана залежно від різниці ходу Δd',
        ekLabel: 'Інтенсив. I(z)',
        epLabel: 'Когерент. доданок',
        qLabel: 'Гасіння (мін.)',
        cameraPos: [0, 8.8, 12.8],
        cameraTarget: [0, 2.0, 0],
        referenceLatex: String.raw`\begin{aligned}
          \Delta d &= |r_2 - r_1| \approx \frac{d\cdot z}{L}, \qquad \Delta\varphi = \frac{2\pi}{\lambda}\Delta d \\
          I(z) &= 4 I_0 \cos^2\!\left(\frac{\pi d z}{\lambda L}\right), \qquad \Delta z_{\text{см}} = \frac{\lambda L}{d}
        \end{aligned}`,
        question: 'У досліді Юнга два когерентні світлові фронти від щілин $S_1$ і $S_2$ приходять у точку на екрані з оптичною різницею ходу $\\Delta d = 1.5\\lambda$ (три півхвилі). Що спостерігатиметься в цій точці?',
        options: [
          'Інтерференційний максимум ($I = 4I_0$), бо хвилі підсилюють одна одну',
          'Інтерференційний мінімум (темна смуга, $I = 0$), оскільки гребінь одного світлового фронту накладається на западину іншого в протифазі',
          'Рівномірна освітленість $I = 2I_0$'
        ],
        correctIndex: 1,
        explanation: 'Коли різниця ходу становить непарне число півхвиль $\\Delta d = (m + \\frac{1}{2})\\lambda$, різниця фаз дорівнює $\\Delta\\varphi = \\pi, 3\\pi, \\dots$ У цій точці гребінь світлового фронту від першої щілини зустрічається із западиною фронту від другої щілини, тому коливання взаємно гасять одне одного ($I = 0$).',
        formulaLatex: String.raw`\Delta d = m\lambda \; (\text{максимум}), \qquad \Delta d = \left(m + \frac{1}{2}\right)\lambda \; (\text{мінімум})`,
        liveLatexFn: p => {
          const fringeWidth = (p.wavelength * 1e-3 * p.screenL) / p.slitD;
          const pathDiffLambda = (p.slitD * Math.abs(p.probeZ)) / (p.wavelength * 1e-3 * p.screenL);
          return String.raw`\Delta z_{\text{смуги}} = ${fringeWidth.toFixed(2)}\text{ мм}, \qquad \frac{\Delta d}{\lambda} = ${pathDiffLambda.toFixed(2)}`;
        },
        defaults: { wavelength: 520, slitD: 2.2, screenL: 6.0, probeZ: 0.8 },
        sliders: [
          { key: 'wavelength', label: 'Довжина хвилі світла λ', min: 400, max: 700, step: 15, unit: 'нм' },
          { key: 'slitD', label: 'Відстань між щілинами d', min: 1.0, max: 3.6, step: 0.2, unit: 'мм' },
          { key: 'screenL', label: 'База до екрана L', min: 4.5, max: 7.5, step: 0.5, unit: 'м' },
          { key: 'probeZ', label: 'Точка спостереження на екрані z', min: -3.2, max: 3.2, step: 0.1, unit: 'мм' }
        ]
      },

      dispersion: {
        secSym: '§ 11.',
        shortTitle: 'Дисперсія світла у призмі',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Світлові явища, хвильовий фронт та оптика',
        badge: 'Спектр світла',
        subtitle: 'Залежність показника заломлення n(λ) від довжини хвилі та розклад спектра',
        secTag: 'Параграф § 11 — Спектральна та геометрична оптика',
        title: 'Дисперсія світла та утворення спектра у призмі',
        epigraph: 'Вузький пучок білого світла у скляній призмі розкладається у райдужний спектр через те, що короткі фіолетові хвилі мають меншу фазову швидкість у склі, ніж довгі червоні.',
        figCaption: 'Рис. 11.1 — Спектральний розподіл кутів відхилення та фазових швидкостей у призмі',
        ekLabel: 'Червоний (680нм)',
        epLabel: 'Зелений (530нм)',
        qLabel: 'Фіолет. (410нм)',
        cameraPos: [0, 5.8, 13.2],
        cameraTarget: [0.4, 2.3, 0],
        referenceLatex: String.raw`\begin{aligned}
          n(\lambda) &= n_0 + \frac{B}{\lambda^2} \quad (\text{формула Коші}), \qquad v(\lambda) = \frac{c}{n(\lambda)} \\
          \delta(\lambda) &= \alpha_1 + \arcsin\!\big(n(\lambda)\sin(\varphi - \gamma_1)\big) - \varphi
        \end{aligned}`,
        question: 'Білий світловий пучок проходить крізь скляну тригранну призму. Промені якого кольору заломлюються на найбільший кут відхилення $\\delta$ і чому?',
        options: [
          'Червоні промені ($\\lambda \\approx 680\\text{ нм}$), бо вони мають найбільшу довжину хвилі',
          'Фіолетові промені ($\\lambda \\approx 410\\text{ нм}$), бо для меншої довжини хвилі показник заломлення скла більший ($n_{\\text{фіол}} > n_{\\text{черв}}$), а швидкість світлового фронту найменша',
          'Усі кольори заломлюються під однаковим кутом'
        ],
        correctIndex: 1,
        explanation: 'При нормальній дисперсії показник заломлення речовини монотонно зростає зі зменшенням довжини хвилі за законом Коші $n(\\lambda) = n_0 + B/\\lambda^2$. Оскільки $\\lambda_{\\text{фіол}} < \\lambda_{\\text{черв}}$, фіолетовий світловий фронт сповільнюється у склі сильніше ($v_{\\text{фіол}} < v_{\\text{черв}}$), тому $n_{\\text{фіол}} > n_{\\text{черв}}$ і фіолетові промені відхиляються до основи призми найбільше.',
        formulaLatex: String.raw`\lambda_{\text{фіол}} < \lambda_{\text{черв}} \implies n_{\text{фіол}} > n_{\text{черв}} \implies \delta_{\text{фіол}} > \delta_{\text{черв}}`,
        liveLatexFn: p => {
          const nRed = p.n0 + (p.cauchyB * 0.25) / (0.68 * 0.68);
          const nViol = p.n0 + (p.cauchyB * 0.25) / (0.405 * 0.405);
          return String.raw`n_{\text{черв}} = ${nRed.toFixed(3)}, \quad n_{\text{фіол}} = ${nViol.toFixed(3)}, \quad \Delta n = ${(nViol - nRed).toFixed(3)}`;
        },
        defaults: { apexAngle: 52, incAngle: 44, n0: 1.50, cauchyB: 0.06 },
        sliders: [
          { key: 'apexAngle', label: 'Заломлюючий кут призми φ', min: 35, max: 62, step: 1, unit: '°' },
          { key: 'incAngle', label: 'Кут падіння білого променя α₁', min: 25, max: 65, step: 1, unit: '°' },
          { key: 'n0', label: 'Базовий показник скла n₀', min: 1.42, max: 1.72, step: 0.02, unit: '' },
          { key: 'cauchyB', label: 'Коефіцієнт дисперсії B', min: 0.02, max: 0.12, step: 0.01, unit: 'мкм²' }
        ]
      },

      emwave: {
        secSym: '§ 12.',
        shortTitle: 'Електромагнітна хвиля та потік Пойнтінга',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Світлові явища, хвильовий фронт та оптика',
        badge: 'Природа світла',
        subtitle: 'Взаємно перпендикулярні поля E ⊥ B, фазовий фронт та поляризація світла',
        secTag: 'Параграф § 12 — Електромагнітна теорія світла Максвелла',
        title: 'Електромагнітна світлова хвиля (E, B та вектор Пойнтінга)',
        epigraph: 'Світло — це поперечна електромагнітна хвиля, у кожній площині світлового фронту якої вектори E та B коливаються в одній фазі перпендикулярно до напрямку поширення.',
        figCaption: 'Рис. 12.1 — Миттєва густина енергії електричного w_E та магнітного w_B полів',
        ekLabel: 'Електр. w_E',
        epLabel: 'Магніт. w_B',
        qLabel: 'Потік Пойнтінга S',
        cameraPos: [0, 5.2, 13.8],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          \vec{E}(x,t) &= \vec{E}_0\sin(kx - \omega t), \qquad \vec{B}(x,t) = \vec{B}_0\sin(kx - \omega t) \\
          \vec{S} &= \frac{1}{\mu_0}[\vec{E}\times\vec{B}], \qquad c = \frac{1}{\sqrt{\varepsilon_0\mu_0}}, \qquad \vec{E}\perp\vec{B}\perp\vec{k}
        \end{aligned}`,
        question: 'Як орієнтовані вектори напруженості електричного поля $\\vec{E}$ та індукції магнітного поля $\\vec{B}$ відносно площини світлового фронту та напрямку променя $\\vec{k}$ у вільній світловій хвилі?',
        options: [
          'Вектори $\\vec{E}$ та $\\vec{B}$ спрямовані вздовж променя $\\vec{k}$ (поздовжня хвиля)',
          'Вектори $\\vec{E}$ та $\\vec{B}$ лежать у площині світлового фронту, взаємно перпендикулярні ($\\vec{E}\\perp\\vec{B}$) і коливаються в одній фазі, утворюючи з $\\vec{k}$ праву трійку',
          'Коливання $\\vec{E}$ та $\\vec{B}$ зсунуті за фазою на $\\pi/2$'
        ],
        correctIndex: 1,
        explanation: 'З рівнянь Максвелла випливає, що світлова хвиля є строго поперечною: вектори $\\vec{E}$ та $\\vec{B}$ завжди лежать у площині хвильового фронту ($\\vec{E}\\perp\\vec{k}$, $\\vec{B}\\perp\\vec{k}$), перпендикулярні один до одного ($\\vec{E}\\perp\\vec{B}$) і досягають максимумів та нулів одночасно (у фазі). Векторний добуток $\\vec{S} = \\frac{1}{\\mu_0}[\\vec{E}\\times\\vec{B}]$ визначає напрямок і густину потоку світлової енергії.',
        formulaLatex: String.raw`w_E = \frac{\varepsilon\varepsilon_0 E^2}{2} = w_B = \frac{B^2}{2\mu_0}, \qquad S = \frac{EB}{\mu_0} = c\cdot w_{\text{повн}}`,
        liveLatexFn: p => {
          const vPhase = 300 / p.mediumN;
          const polName = p.ellipticity < 0.08 ? '\\text{Лінійна}' : p.ellipticity > 0.92 ? '\\text{Колова}' : '\\text{Еліптична}';
          return String.raw`\lambda = ${p.wavelength.toFixed(1)}\text{ м}, \quad v_{\text{фаз}} = ${vPhase.toFixed(0)}\text{ тис. км/с}, \quad \text{Поляризація: } ${polName}`;
        },
        defaults: { wavelength: 3.2, ampE: 1.6, mediumN: 1.0, ellipticity: 0.0 },
        sliders: [
          { key: 'wavelength', label: 'Довжина хвилі між фронтами λ', min: 1.8, max: 4.8, step: 0.2, unit: 'м' },
          { key: 'ampE', label: 'Амплітуда поля E₀', min: 0.8, max: 2.2, step: 0.1, unit: 'В/м' },
          { key: 'mediumN', label: 'Показник заломлення середовища n', min: 1.0, max: 2.2, step: 0.1, unit: '' },
          { key: 'ellipticity', label: 'Еліптичність поляризації ε', min: 0.0, max: 1.0, step: 0.1, unit: '' }
        ]
      },

      bernoulli: {
        secSym: '§ 13.',
        shortTitle: 'Рівняння Бернуллі (трубка Вентурі)',
        category: 'thermo',
        categoryGroupTitle: 'Розділ ІІ. Гідростатика, гідродинаміка та МКТ',
        badge: 'Гідродинаміка',
        subtitle: 'Зв’язок швидкості потоку рідини та статичного тиску у трубі змінного перерізу',
        secTag: 'Параграф § 13 — Механіка суцільних середовищ',
        title: 'Рівняння Бернуллі та ефект Вентурі',
        epigraph: 'У стаціонарному потоці ідеальної нестисливої рідини сума статичного та динамічного тисків залишається сталою вздовж лінії течії.',
        figCaption: 'Рис. 13.1 — Баланс статичного тиску P та густини кінетичної енергії потоку ρv²/2',
        ekLabel: 'Динам. ρv₂²/2',
        epLabel: 'Статич. тиск P₂',
        qLabel: 'Втрати в’язк.',
        cameraPos: [0, 5.2, 14.5],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          S_1 v_1 &= S_2 v_2 = Q = \text{const} \\
          P_1 + \frac{\rho v_1^2}{2} &= P_2 + \frac{\rho v_2^2}{2} = \text{const}
        \end{aligned}`,
        question: 'Рідина тече горизонтальною трубкою Вентурі з широкої ділянки площею $S_1$ у вузьке горло площею $S_2 < S_1$. Як зміняться швидкість потоку $v_2$ та висота стовпчика рідини $h_2$ у п’єзометрі над вузькою ділянкою?',
        options: [
          'У вузькому перерізі швидкість зменшиться, а тиск і рівень рідини $h_2$ зростуть',
          'Швидкість потоку у звуженні зросте ($v_2 = v_1 S_1/S_2$), а статичний тиск і рівень стовпчика $h_2$ впадуть',
          'Швидкість зросте, але статичний тиск $P$ у всіх перерізах залишиться однаковим'
        ],
        correctIndex: 1,
        explanation: 'За рівнянням нерозривності струменя $S_1 v_1 = S_2 v_2$, у вузькій горловині швидкість рідини зростає обернено пропорційно площі перерізу: $v_2 = v_1 (D_1/D_2)^2$. Згідно із законом збереження енергії (рівнянням Бернуллі), зростання динамічного напору $\\frac{1}{2}\\rho v_2^2$ неминуче супроводжується падінням статичного тиску: $P_2 = P_1 - \\frac{1}{2}\\rho(v_2^2 - v_1^2)$, тому стовпчик рідини в центральному манометрі опускається нижче за бічні.',
        formulaLatex: String.raw`v_2 = v_1 \left(\frac{D_1}{D_2}\right)^{\!2}, \qquad \Delta P = P_1 - P_2 = \frac{\rho v_1^2}{2}\!\left[\left(\frac{D_1}{D_2}\right)^{\!4} - 1\right]`,
        liveLatexFn: p => {
          const ratioSq = Math.pow(p.d1 / p.d2, 2);
          const v2 = p.v1 * ratioSq;
          const dP_kPa = 0.5 * p.rho * (v2 * v2 - p.v1 * p.v1) / 1000;
          return String.raw`v_2 = ${v2.toFixed(2)}\text{ м/с}, \quad \Delta P = P_1 - P_2 = ${dP_kPa.toFixed(2)}\text{ кПа}`;
        },
        defaults: { v1: 1.5, d1: 2.2, d2: 1.2, rho: 1000 },
        sliders: [
          { key: 'v1', label: 'Швидкість на вході v₁', min: 0.6, max: 2.8, step: 0.1, unit: 'м/с' },
          { key: 'd1', label: 'Діаметр широкої труби D₁', min: 1.8, max: 2.6, step: 0.1, unit: 'м' },
          { key: 'd2', label: 'Діаметр горловини D₂', min: 0.8, max: 1.7, step: 0.05, unit: 'м' },
          { key: 'rho', label: 'Густина рідини ρ', min: 700, max: 1400, step: 50, unit: 'кг/м³' }
        ]
      },

      lens: {
        secSym: '§ 14.',
        shortTitle: 'Збиральна лінза та фокусування фронту',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Світлові явища, хвильовий фронт і оптика',
        badge: 'Світло і фронт',
        subtitle: 'Перетворення плоского світлового фронту на сферичний збіжний фронт у лінзі',
        secTag: 'Параграф § 14 — Геометрична та хвильова оптика лінз',
        title: 'Збиральна лінза та фокусування світлового фронту',
        epigraph: 'Оптична лінза затримує центральну частину світлового фронту сильніше за краї, перетворюючи плоский хвильовий фронт на сферичний фронт, що сходиться у фокусі.',
        figCaption: 'Рис. 14.1 — Концентрація світлової енергії та оптична сила тонкої лінзи D = 1/F',
        ekLabel: 'Світл. потік Φ',
        epLabel: 'Опт. сила D',
        qLabel: 'Відбиття R',
        cameraPos: [0, 5.4, 14.6],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          D &= \frac{1}{F} = (n - 1)\!\left(\frac{1}{R_1} + \frac{1}{R_2}\right) \\
          \frac{1}{d} + \frac{1}{f} &= \frac{1}{F}, \qquad \Gamma = \frac{H}{h} = \frac{f}{d}
        \end{aligned}`,
        question: 'Паралельний пучок світла з плоским хвильовим фронтом падає на двоопуклу скляну лінзу. Чому після проходження крізь лінзу плоский світловий фронт стає сферичним і сходиться в одну точку (головний фокус $F$)?',
        options: [
          'Тому що у склі світло прискорюється пропорційно товщині лінзи',
          'Центр лінзи товщий за краї, тому центральна ділянка хвильового фронту довше йде у склі з меншою швидкістю $v = c/n$ і відстає від країв, вигинаючи фронт у збіжну сферу',
          'Фокусна відстань $F$ не залежить від показника заломлення скла $n$'
        ],
        correctIndex: 1,
        explanation: 'Згідно з принципом Ферма та принципом Гюйгенса, оптична довжина шляху $L = n\\cdot l$ для всіх променів від плоского фронту до фокуса $F$ однакова. Оскільки поблизу оптичної осі лінза має найбільшу товщину, центральна частина світлового фронту рухається у склі зі швидкістю $v = c/n$ довше, ніж периферійні промені. У результаті плоский фронт вигинається у сферичну поверхню, центр кривизни якої лежить у головному фокусі $F = \\frac{R}{2(n-1)}$.',
        formulaLatex: String.raw`F = \frac{R}{2(n - 1)}, \qquad D = \frac{1}{F}\text{ [дптр]}, \qquad f = \frac{d\cdot F}{d - F}`,
        liveLatexFn: p => {
          const F = p.radiusR / (2 * (p.glassN - 1));
          const D = 1 / F;
          return String.raw`n = ${p.glassN.toFixed(2)}, \quad R = ${p.radiusR.toFixed(1)}\text{ м} \implies F = ${F.toFixed(2)}\text{ м}, \quad D = ${D.toFixed(2)}\text{ дптр}`;
        },
        defaults: { glassN: 1.55, radiusR: 3.4, beamAperture: 1.6, wavelength: 510 },
        sliders: [
          { key: 'glassN', label: 'Показник заломлення лінзи n', min: 1.35, max: 1.90, step: 0.05, unit: '' },
          { key: 'radiusR', label: 'Радіус кривизни граней R', min: 2.2, max: 5.2, step: 0.2, unit: 'м' },
          { key: 'beamAperture', label: 'Ширина світлового пучка H', min: 0.8, max: 2.1, step: 0.1, unit: 'м' },
          { key: 'wavelength', label: 'Довжина хвилі світла λ', min: 410, max: 680, step: 10, unit: 'нм' }
        ]
      },

      lorentz: {
        secSym: '§ 15.',
        shortTitle: 'Сила Лоренца: спіраль у магнітному полі',
        category: 'electro',
        categoryGroupTitle: 'Розділ ІV. Електродинаміка та магнітне поле',
        badge: 'Магнетизм',
        subtitle: 'Рух зарядженої частинки по гвинтовій лінії (спіралі) в однорідному полі B',
        secTag: 'Параграф § 15 — Рух зарядів у магнітному полі',
        title: 'Сила Лоренца та циклотронна спіраль у 3D',
        epigraph: 'Оскільки сила Лоренца завжди перпендикулярна до швидкості частинки, вона не виконує механічної роботи, але викривляє траєкторію у коло або тривимірну гвинтову спіраль.',
        figCaption: 'Рис. 15.1 — Складові кінетичної енергії впоперек (E_⊥) та вздовж (E_∥) ліній магнітної індукції B',
        ekLabel: 'Оберт. E_⊥',
        epLabel: 'Поздовж. E_∥',
        qLabel: 'Робота A_L = 0',
        cameraPos: [0, 6.2, 14.8],
        cameraTarget: [0, 2.4, 0],
        referenceLatex: String.raw`\begin{aligned}
          \vec{F}_L &= q[\vec{v}\times\vec{B}], \qquad F_L = |q| v B \sin\alpha \\
          R &= \frac{m v_\perp}{|q| B} = \frac{m v \sin\alpha}{|q| B}, \qquad T = \frac{2\pi m}{|q| B}, \qquad h = v_\parallel T
        \end{aligned}`,
        question: 'Заряджена частинка влітає в однорідне магнітне поле індукцією $\\vec{B}$ під гострим кутом $\\alpha$ до силових ліній. Як зміниться кінетична енергія частинки $E_k$ та форма її траєкторії при збільшенні індукції поля $B$ удвічі?',
        options: [
          'Кінетична енергія зросте вдвічі, а частинка полетить вздовж прямої лінії',
          'Кінетична енергія $E_k$ не зміниться (оскільки $\\vec{F}_L \\perp \\vec{v}$ і робота $A = 0$), а радіус витків гвинтової спіралі $R$ зменшиться вдвічі',
          'Частинка миттєво зупиниться через гальмування магнітним полем'
        ],
        correctIndex: 1,
        explanation: 'Сила Лоренца $\\vec{F}_L = q[\\vec{v}\\times\\vec{B}]$ у кожній точці перпендикулярна до вектора швидкості $\\vec{v}$, тому її елементарна робота дорівнює нулю ($dA = \\vec{F}_L\\cdot d\\vec{r} = 0$), а модуль швидкості та кінетична енергія $E_k = \\text{const}$ залишаються незмінними. Поперечна складова швидкості $v_\\perp = v\\sin\\alpha$ зумовлює обертання по колу радіуса $R = \\frac{mv\\sin\\alpha}{|q|B}$, а поздовжня складова $v_\\parallel = v\\cos\\alpha$ рівномірно переносить частинку вздовж поля $\\vec{B}$, утворюючи 3D-спіраль.',
        formulaLatex: String.raw`R = \frac{m v \sin\alpha}{|q| B}, \qquad h = \frac{2\pi m v \cos\alpha}{|q| B}, \qquad A_{\text{Лор}} = 0`,
        liveLatexFn: p => {
          const rad = (p.pitchAngle * Math.PI) / 180;
          const vPerp = p.v0 * Math.sin(rad);
          const vPar = p.v0 * Math.cos(rad);
          const R = vPerp / (p.qOverM * p.fieldB);
          const stepH = (2 * Math.PI * vPar) / (p.qOverM * p.fieldB);
          return String.raw`R = ${R.toFixed(2)}\text{ м}, \quad h_{\text{крок}} = ${stepH.toFixed(2)}\text{ м}, \quad F_L = ${(p.qOverM * p.v0 * p.fieldB * Math.sin(rad)).toFixed(1)}\text{ Н}`;
        },
        defaults: { fieldB: 1.5, v0: 4.2, pitchAngle: 68, qOverM: 1.8 },
        sliders: [
          { key: 'fieldB', label: 'Магнітна індукція поля B', min: 0.6, max: 3.0, step: 0.1, unit: 'Тл' },
          { key: 'v0', label: 'Початкова швидкість частинки v₀', min: 2.0, max: 6.5, step: 0.25, unit: 'м/с' },
          { key: 'pitchAngle', label: 'Кут вльоту до ліній поля α', min: 25, max: 90, step: 5, unit: '°' },
          { key: 'qOverM', label: 'Питомий заряд частинки |q|/m', min: 0.8, max: 3.2, step: 0.2, unit: 'Кл/кг' }
        ]
      },

      faraday: {
        secSym: '§ 16.',
        shortTitle: 'Електромагнітна індукція Фарадея — Ленца',
        category: 'electro',
        categoryGroupTitle: 'Розділ ІV. Електродинаміка та магнітне поле',
        badge: 'Індукція',
        subtitle: 'Генерація індукційного струму в котушці під час руху магніту та правило Ленца',
        secTag: 'Параграф § 16 — Закон електромагнітної індукції',
        title: 'Закон Фарадея та правило Ленца у 3D',
        epigraph: 'Електрорушійна сила індукції в замкненому контурі дорівнює і протилежна за знаком швидкості зміни магнітного потоку крізь поверхню, обмежену цим контуром.',
        figCaption: 'Рис. 16.1 — ЕРС індукції E_i та джоулева потужність струму P = I²R під час руху магніту',
        ekLabel: 'Магн. потік Φ',
        epLabel: 'ЕРС індукції |E_i|',
        qLabel: 'Джоулеве тепло Q',
        cameraPos: [0, 5.4, 14.2],
        cameraTarget: [0, 2.1, 0],
        referenceLatex: String.raw`\begin{aligned}
          \mathcal{E}_i &= -N \frac{d\Phi_B}{dt}, \qquad \Phi_B = B S \cos\theta \\
          I_i &= \frac{\mathcal{E}_i}{R}, \qquad F_{\text{гальм}} \sim \frac{N^2 B^2 S^2 v}{R}
        \end{aligned}`,
        question: 'Штабовий магніт північним полюсом ($N$) швидко всовують у замкнену мідну котушку. Від чого залежить величина індукційного струму в котушці і куди буде напрямлене індуковане магнітне поле котушки $\\vec{B}_{\\text{інд}}$?',
        options: [
          'Струм залежить лише від того, наскільки сильний магніт лежить нерухомо всередині котушки',
          'ЕРС індукції пропорційна швидкості зміни магнітного потоку $\\mathcal{E}_i = -N\\frac{d\\Phi_B}{dt}$, а за правилом Ленца поле $\\vec{B}_{\\text{інд}}$ спрямоване назустріч полю магніту, протидіючи його наближенню',
          'Поле котушки завжди втягує магніт усередину при його наближенні'
        ],
        correctIndex: 1,
        explanation: 'За законом Фарадея індукційний струм виникає лише тоді, коли магнітний потік $\\Phi_B$ крізь витки котушки змінюється в часі ($d\\Phi_B/dt \\neq 0$). Чим більша швидкість руху магніту $\\omega$ та кількість витків $N$, тим вища ЕРС індукції $\\mathcal{E}_i$. Знак «мінус» виражає правило Ленца: індукційний струм створює власне магнітне поле $\\vec{B}_{\\text{інд}}$, яке відштовхує магніт при наближенні та притягує при віддаленні.',
        formulaLatex: String.raw`\mathcal{E}_i(t) = -N \frac{d\Phi_B}{dt}, \qquad I(t) = \frac{\mathcal{E}_i(t)}{R_{\text{опір}}}, \qquad P_{\text{ел}} = \frac{\mathcal{E}_i^2}{R_{\text{опір}}}`,
        liveLatexFn: p => {
          const maxEmf = p.turnsN * p.magnetB * p.freq * 0.18;
          const maxI = maxEmf / p.coilR;
          return String.raw`N = ${p.turnsN}\text{ витків}, \quad |\mathcal{E}_{i,\max}| \approx ${maxEmf.toFixed(1)}\text{ В}, \quad I_{\max} = ${maxI.toFixed(2)}\text{ А}`;
        },
        defaults: { turnsN: 12, magnetB: 1.6, freq: 2.2, coilR: 2.0 },
        sliders: [
          { key: 'turnsN', label: 'Кількість витків котушки N', min: 4, max: 20, step: 2, unit: '' },
          { key: 'magnetB', label: 'Індукція магніту B₀', min: 0.6, max: 2.5, step: 0.1, unit: 'Тл' },
          { key: 'freq', label: 'Частота коливань магніту ω', min: 0.8, max: 4.0, step: 0.2, unit: 'рад/с' },
          { key: 'coilR', label: 'Електричний опір контуру R', min: 1.0, max: 5.0, step: 0.5, unit: 'Ом' }
        ]
      },

      kepler: {
        secSym: '§ 17.',
        shortTitle: 'Закони Кеплера та гравітаційна орбіта',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ V. Небесна механіка, коливання та хвилі',
        badge: 'Астрофізика',
        subtitle: 'Рух планети по еліптичній орбіті, секторна швидкість та обмін енергій у гравітаційному полі',
        secTag: 'Параграф § 17 — Закон всесвітнього тяжіння · Закони Кеплера',
        title: 'Еліптична орбіта та ІІ закон Кеплера',
        epigraph: 'Радіус-вектор планети за рівні проміжки часу описує рівні площі: у перигелії планета рухається найшвидше, а в афелії — найповільніше.',
        figCaption: 'Рис. 17.1 — Перехід потенціальної гравітаційної енергії в кінетичну між перигелієм та афелієм',
        ekLabel: 'Кінетична E_k',
        epLabel: 'Гравітаційна |U_g|',
        qLabel: 'Момент імпульсу L',
        cameraPos: [0, 9.8, 12.8],
        cameraTarget: [0, 1.5, 0],
        referenceLatex: String.raw`\begin{aligned}
          r(\theta) &= \frac{a(1 - e^2)}{1 + e\cos\theta}, \qquad \frac{dS}{dt} = \frac{L}{2m} = \text{const} \\
          v^2 &= GM\left(\frac{2}{r} - \frac{1}{a}\right), \qquad T^2 = \frac{4\pi^2}{GM}a^3
        \end{aligned}`,
        question: 'Планета рухається навколо зорі по витягнутій еліптичній орбіті з ексцентриситетом $e > 0$. Як змінюється орбітальна швидкість планети $v$ під час її переходу від найближчої точки (перигелію $r_p$) до найвіддаленішої точки (афелію $r_a$)?',
        options: [
          'Швидкість залишається сталою в усіх точках еліптичної орбіти',
          'У перигелії швидкість максимальна $v_p = v_a \\frac{1+e}{1-e}$, а при віддаленні до афелію вона зменшується за законом збереження моменту імпульсу $L = mvr_{\\perp}$',
          'В афелії швидкість планети максимальна через більший радіус орбіти'
        ],
        correctIndex: 1,
        explanation: 'Гравітаційна сила $\\vec{F}_g$ є центральною (її момент відносно зорі дорівнює нулю), тому момент імпульсу планети $L = m v r \\sin\\alpha$ зберігається. Звідси випливає **другий закон Кеплера**: секторна швидкість $dS/dt = L/(2m)$ є сталою. У перигелії відстань мінімальна $r_p = a(1-e)$, тому швидкість максимальна; в афелії $r_a = a(1+e)$ швидкість найменша.',
        formulaLatex: String.raw`r_p = a(1 - e), \qquad r_a = a(1 + e), \qquad \frac{v_p}{v_a} = \frac{1 + e}{1 - e}`,
        liveLatexFn: p => {
          const rp = p.semiMajorA * (1 - p.eccentricity);
          const ra = p.semiMajorA * (1 + p.eccentricity);
          const ratio = (1 + p.eccentricity) / (1 - p.eccentricity);
          return String.raw`r_p = ${rp.toFixed(2)}\text{ а.о.}, \quad r_a = ${ra.toFixed(2)}\text{ а.о.}, \quad v_p / v_a = ${ratio.toFixed(2)}`;
        },
        defaults: { eccentricity: 0.45, semiMajorA: 4.4, starMass: 1.5, planetMass: 1.0 },
        sliders: [
          { key: 'eccentricity', label: 'Ексцентриситет орбіти e', min: 0.0, max: 0.75, step: 0.05, unit: '' },
          { key: 'semiMajorA', label: 'Велика піввісь орбіти a', min: 3.0, max: 5.6, step: 0.2, unit: 'а.о.' },
          { key: 'starMass', label: 'Маса центральної зорі M', min: 0.8, max: 2.5, step: 0.1, unit: 'M☉' },
          { key: 'planetMass', label: 'Маса планети m', min: 0.5, max: 2.5, step: 0.25, unit: 'M⊕' }
        ]
      },

      gyroscope: {
        secSym: '§ 18.',
        shortTitle: 'Момент інерції: кочення тіл з гірки',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ V. Небесна механіка, коливання та хвилі',
        badge: 'Обертання',
        subtitle: 'Змагання суцільного циліндра та порожнистого обруча на похилій площині без проковзування',
        secTag: 'Параграф § 18 — Динаміка обертального руху твердого тіла',
        title: 'Момент інерції та енергія кочення',
        epigraph: 'Під час кочення без проковзування потенціальна енергія переходить одночасно у поступальну та обертальну кінетичну енергію: перемагає тіло з меншим відносним моментом інерції.',
        figCaption: 'Рис. 18.1 — Розподіл поступальної E_пост = ½mv² та обертальної E_об = ½Iω² енергії під час кочення',
        ekLabel: 'Поступальна E_пост',
        epLabel: 'Потенціальна E_p',
        qLabel: 'Обертальна E_об',
        cameraPos: [0, 5.8, 14.8],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          I &= \beta m R^2, \qquad E_k = \frac{1}{2}mv^2 + \frac{1}{2}I\omega^2 = \frac{1}{2}m v^2 (1 + \beta) \\
          a &= \frac{g\sin\alpha}{1 + \beta}, \qquad \beta_{\text{куля}} = 0.4,\; \beta_{\text{цил}} = 0.5,\; \beta_{\text{обруч}} = 1.0
        \end{aligned}`,
        question: 'З вершини похилої площини одночасно без початкової швидкості пускають котитися без проковзування суцільний диск ($\\beta = 0.5$) та тонкостінний обруч ($\\beta = 1.0$) однакової маси й радіуса. Яке тіло дістанеться основи першим?',
        options: [
          'Обидва тіла фінішують одночасно, бо мають однакову масу $m$ і радіус $R$',
          'Суцільний диск прийде першим, бо має менший коефіцієнт моменту інерції $\\beta = 0.5$, і менша частка енергії витрачається на його розкручування',
          'Обруч фінішує першим, бо вся його маса зосереджена на ободі'
        ],
        correctIndex: 1,
        explanation: 'За законом збереження енергії $mgh = \\frac{1}{2}mv^2 + \\frac{1}{2}I\\omega^2 = \\frac{1}{2}mv^2(1 + \\beta)$, де $\\beta = I/(mR^2)$. Звідси лінійне прискорення осі тіла дорівнює $a = \\frac{g\\sin\\alpha}{1 + \\beta}$. Оскільки для суцільного циліндра $\\beta = 0.5$ ($a = \\frac{2}{3}g\\sin\\alpha$), а для тонкого обруча $\\beta = 1.0$ ($a = \\frac{1}{2}g\\sin\\alpha$), суцільний циліндр або куля завжди випереджають обруч незалежно від маси та радіуса!',
        formulaLatex: String.raw`a = \frac{g\sin\alpha}{1 + \beta}, \qquad v_{\text{кін}} = \sqrt{\frac{2gh}{1 + \beta}}, \qquad \frac{E_{\text{об}}}{E_{\text{пост}}} = \beta`,
        liveLatexFn: p => {
          const rad = (p.angle * Math.PI) / 180;
          const acc = (9.81 * Math.sin(rad)) / (1 + p.betaFactor);
          const rotShare = (p.betaFactor / (1 + p.betaFactor)) * 100;
          return String.raw`\beta = ${p.betaFactor.toFixed(2)}, \quad a = ${acc.toFixed(2)}\text{ м/с}^2, \quad E_{\text{об}}/E_k = ${rotShare.toFixed(0)}\%`;
        },
        defaults: { betaFactor: 0.5, angle: 26, radius: 0.65, mass: 2.0 },
        sliders: [
          { key: 'betaFactor', label: 'Коефіцієнт інерції β = I/(mR²)', min: 0.2, max: 1.0, step: 0.1, unit: '' },
          { key: 'angle', label: 'Кут нахилу площини α', min: 14, max: 40, step: 2, unit: '°' },
          { key: 'radius', label: 'Радіус тіла кочення R', min: 0.45, max: 0.9, step: 0.05, unit: 'м' },
          { key: 'mass', label: 'Маса тіла m', min: 1.0, max: 4.0, step: 0.5, unit: 'кг' }
        ]
      },

      standingwave: {
        secSym: '§ 19.',
        shortTitle: 'Стояча хвиля та гармоніки струни',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ V. Небесна механіка, коливання та хвилі',
        badge: 'Акустика',
        subtitle: 'Власні моди коливань закріпленої струни, вузли й пучності та залежність частоти від натягу',
        secTag: 'Параграф § 19 — Механічні хвилі · Стоячі хвилі та резонанс',
        title: 'Стоячі хвилі та обертони струни у 3D',
        epigraph: 'Накладання прямої та відбитої хвиль утворює стоячу хвилю з нерухомими вузлами та пучностями, де енергія затримується між опорами.',
        figCaption: 'Рис. 19.1 — Перехід кінетичної енергії руху струни в потенціальну енергію пружної деформації двічі за період',
        ekLabel: 'Кінетична E_k',
        epLabel: 'Пружна E_p',
        qLabel: 'Повна енергія W',
        cameraPos: [0, 4.8, 14.2],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          y(x,t) &= 2A \sin\left(\frac{n\pi x}{L}\right)\cos(\omega_n t), \qquad \lambda_n = \frac{2L}{n} \\
          v &= \sqrt{\frac{T}{\mu}}, \qquad f_n = \frac{n}{2L}\sqrt{\frac{T}{\mu}} \quad (n = 1, 2, 3, \dots)
        \end{aligned}`,
        question: 'На гітарній струні довжиною $L$, закріпленій з обох кінців, збуджено $n$-ту гармоніку стоячої хвилі ($n = 3$). Скільки пучностей (точок максимальної амплітуди) утворюється вздовж струни і як зміниться частота тону $f_n$, якщо силу натягу $T$ збільшити у 4 рази?',
        options: [
          'Утвориться 3 пучності, а частота $f_n$ зросте у 2 рази, оскільки $f_n \\propto \\sqrt{T}$',
          'Утвориться 1 пучність, а частота збільшиться в 4 рази',
          'Кількість пучностей і частота не залежать від номера гармоніки $n$ та натягу $T$'
        ],
        correctIndex: 0,
        explanation: 'Для струни, закріпленої на кінцях, умова стоячої хвилі вимагає $L = n\\frac{\\lambda_n}{2}$, тому номер гармоніки $n$ безпосередньо дорівнює **кількості пучностей** (і на одиницю менший за загальну кількість вузлів разом із кінцями $n+1$). Оскільки фазова швидкість хвилі $v = \\sqrt{T/\\mu}$, збільшення натягу $T$ в 4 рази підвищує швидкість і власну частоту $f_n = \\frac{n}{2L}\\sqrt{\\frac{T}{\\mu}}$ рівно вдвічі.',
        formulaLatex: String.raw`\lambda_n = \frac{2L}{n}, \qquad v = \sqrt{\frac{T}{\mu}}, \qquad f_n = \frac{n}{2L}\sqrt{\frac{T}{\mu}}`,
        liveLatexFn: p => {
          const L = 9.6;
          const v = Math.sqrt(p.tension / (p.linearMu * 0.001));
          const lambdaN = (2 * L) / p.harmonicN;
          const fn = v / lambdaN;
          return String.raw`n = ${p.harmonicN}, \quad \lambda_${p.harmonicN} = ${lambdaN.toFixed(2)}\text{ м}, \quad f_${p.harmonicN} = ${fn.toFixed(1)}\text{ Гц}`;
        },
        defaults: { harmonicN: 3, tension: 45, linearMu: 1.5, amplitude: 1.1 },
        sliders: [
          { key: 'harmonicN', label: 'Номер гармоніки (число пучностей) n', min: 1, max: 6, step: 1, unit: '' },
          { key: 'tension', label: 'Сила натягу струни T', min: 15, max: 90, step: 5, unit: 'Н' },
          { key: 'linearMu', label: 'Лінійна густина струни μ', min: 0.5, max: 3.5, step: 0.25, unit: 'г/м' },
          { key: 'amplitude', label: 'Амплітуда пучності A', min: 0.4, max: 1.6, step: 0.1, unit: 'м' }
        ]
      },

      doppler: {
        secSym: '§ 20.',
        shortTitle: 'Ефект Доплера та рухомий хвильовий фронт',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Оптика, хвильовий фронт та електромагнетизм',
        badge: 'Хвильовий фронт',
        subtitle: 'Стиснення сферичних хвильових фронтів попереду рухомого джерела, зміщення частоти та конус Маха',
        secTag: 'Параграф § 20 — Хвильова фізика · Ефект Доплера та хвильові фронти',
        title: 'Ефект Доплера та деформація хвильового фронту',
        epigraph: 'Рух джерела хвиль стискає гребені хвильового фронту попереду себе, зменшуючи довжину хвилі λ′ і підвищуючи частоту для нерухомого приймача.',
        figCaption: 'Рис. 20.1 — Порівняння частоти попереду джерела f₊ (синє зміщення) та позаду f₋ (червоне зміщення)',
        ekLabel: 'Частота попереду f₊',
        epLabel: 'Власна частота f₀',
        qLabel: 'Частота позаду f₋',
        cameraPos: [0, 9.2, 13.5],
        cameraTarget: [0, 1.5, 0],
        referenceLatex: String.raw`\begin{aligned}
          \lambda_{\text{попереду}} &= \lambda_0 \left(1 - \frac{v_s}{v}\right), \qquad \lambda_{\text{позаду}} = \lambda_0 \left(1 + \frac{v_s}{v}\right) \\
          f_+ &= \frac{f_0}{1 - M}, \qquad f_- = \frac{f_0}{1 + M}, \qquad M = \frac{v_s}{v}
        \end{aligned}`,
        question: 'Джерело монохроматичних хвиль рухається праворуч зі швидкістю $v_s = 0.5 v$, де $v$ — швидкість поширення хвильового фронту в середовищі. Як зміняться відстань між сусідніми гребенями хвильового фронту $\\lambda_+$ та частота $f_+$, яку реєструє нерухомий спостерігач попереду джерела?',
        options: [
          'Довжина хвилі й частота не зміняться, бо швидкість хвилі в середовищі стала',
          'Попереду джерела хвильові фронти стискаються вдвічі ($\\lambda_+ = 0.5\\lambda_0$), тому спостерігач фіксує вдвічі вищу частоту $f_+ = 2 f_0$',
          'Попереду джерела довжина хвилі розтягується, а частота падає вдвічі'
        ],
        correctIndex: 1,
        explanation: 'За один період випромінювання $T_0 = 1/f_0$ хвильовий фронт проходить шлях $v T_0 = \\lambda_0$, але саме джерело встигає зміститися слідом за ним на $v_s T_0$. Тому відстань між сусідніми фронтами попереду джерела скорочується до $\\lambda_+ = (v - v_s)T_0 = \\lambda_0(1 - M)$, а частота зростає до $f_+ = \\frac{f_0}{1 - M}$ (при $M = 0.5$ отримуємо $f_+ = 2f_0$).',
        formulaLatex: String.raw`f_+ = \frac{f_0}{1 - v_s/v}, \qquad f_- = \frac{f_0}{1 + v_s/v}, \qquad \sin\theta_{\text{Маха}} = \frac{v}{v_s}`,
        liveLatexFn: p => {
          const fPlus = p.machRatio < 0.98 ? (p.emitFreq / (1 - p.machRatio)).toFixed(2) : '∞';
          const fMinus = (p.emitFreq / (1 + p.machRatio)).toFixed(2);
          return String.raw`M = ${p.machRatio.toFixed(2)}, \quad f_+ = ${fPlus}\text{ Гц}, \quad f_- = ${fMinus}\text{ Гц}`;
        },
        defaults: { machRatio: 0.55, waveSpeed: 3.6, emitFreq: 2.0, amplitude: 1.0 },
        sliders: [
          { key: 'machRatio', label: 'Число Маха джерела M = v_s / v', min: 0.0, max: 1.25, step: 0.05, unit: '' },
          { key: 'waveSpeed', label: 'Швидкість хвильового фронту v', min: 2.2, max: 5.0, step: 0.2, unit: 'м/с' },
          { key: 'emitFreq', label: 'Власна частота джерела f₀', min: 1.0, max: 3.5, step: 0.25, unit: 'Гц' },
          { key: 'amplitude', label: 'Інтенсивність гребенів фронту I₀', min: 0.5, max: 1.5, step: 0.1, unit: 'од.' }
        ]
      },

      brewster: {
        secSym: '§ 21.',
        shortTitle: 'Поляризація світла: кут Брюстера і закон Малюса',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Оптика, хвильовий фронт та електромагнетизм',
        badge: 'Поляризація',
        subtitle: 'Проходження лінійно поляризованого світлового фронту крізь поляризатор та обертовий аналізатор',
        secTag: 'Параграф § 21 — Поперечність світлових хвиль · Закон Малюса та кут Брюстера',
        title: 'Поляризація світлового фронту та закон Малюса',
        epigraph: 'Оскільки світлова хвиля є поперечною, кристалічний аналізатор пропускає лише ту проєкцію вектора E, яка паралельна його оптичній осі.',
        figCaption: 'Рис. 21.1 — Інтенсивність пройденого світла I = I₀ cos²θ та поглинута аналізатором частка енергії',
        ekLabel: 'Пройдене I₀cos²θ',
        epLabel: 'Вхідне після P₁ (I₀)',
        qLabel: 'Затримане I₀sin²θ',
        cameraPos: [0, 5.2, 14.4],
        cameraTarget: [0, 2.3, 0],
        referenceLatex: String.raw`\begin{aligned}
          E_{\text{вих}} &= E_0 \cos\theta, \qquad I(\theta) = I_0 \cos^2\theta \quad (\text{закон Малюса}) \\
          \tan\theta_B &= n_{21}, \qquad \theta_B + \theta_{\text{залом}} = 90^\circ \quad (\text{закон Брюстера})
        \end{aligned}`,
        question: 'Лінійно поляризований світловий промінь інтенсивністю $I_0$ падає на другий поляроїд (аналізатор), оптична вісь якого повернута на кут $\\theta = 60^\\circ$ відносно площини поляризації променя. Яка інтенсивність світла $I$ вийде з аналізатора?',
        options: [
          'Інтенсивність зменшиться вдвічі: $I = 0.5 I_0$',
          'Амплітуда поля зменшиться як $E = E_0\\cos 60^\\circ = 0.5 E_0$, а інтенсивність за законом Малюса зменшиться вчетверо: $I = I_0\\cos^2 60^\\circ = 0.25 I_0$',
          'Світло повністю загасне вже при куті $60^\\circ$'
        ],
        correctIndex: 1,
        explanation: 'Кристал аналізатора пропускає складову електричного поля $E = E_0 \\cos\\theta$ вздовж своєї осі пропускання. Оскільки світлова інтенсивність пропорційна квадрату амплітуди поля ($I \\propto E^2$), отримуємо **закон Малюса**: $I(\\theta) = I_0 \\cos^2\\theta$. При $\\theta = 60^\\circ$ маємо $\\cos 60^\\circ = 0.5$, отже $I = 0.25 I_0$, а при $\\theta = 90^\\circ$ (схрещені поляроїди) настає повне гасіння світлового фронту.',
        formulaLatex: String.raw`I(\theta) = I_0 \cos^2\theta, \qquad E(\theta) = E_0 |\cos\theta|, \qquad \theta_B = \arctan(n)`,
        liveLatexFn: p => {
          const rad = (p.analyzerAngle * Math.PI) / 180;
          const cosVal = Math.cos(rad);
          const iOut = p.incidentI0 * cosVal * cosVal;
          const brewster = (Math.atan(p.refractiveN) * 180) / Math.PI;
          return String.raw`\theta = ${p.analyzerAngle}^\circ, \quad I = ${iOut.toFixed(1)}\text{ Вт/м}^2, \quad \theta_B = ${brewster.toFixed(1)}^\circ`;
        },
        defaults: { analyzerAngle: 35, incidentI0: 100, wavelength: 530, refractiveN: 1.52 },
        sliders: [
          { key: 'analyzerAngle', label: 'Кут повороту осі аналізатора θ', min: 0, max: 90, step: 5, unit: '°' },
          { key: 'incidentI0', label: 'Інтенсивність після поляризатора I₀', min: 40, max: 160, step: 10, unit: 'Вт/м²' },
          { key: 'wavelength', label: 'Довжина світлової хвилі λ', min: 420, max: 680, step: 20, unit: 'нм' },
          { key: 'refractiveN', label: 'Показник заломлення скла n (для θ_B)', min: 1.3, max: 1.9, step: 0.05, unit: '' }
        ]
      },

      diffraction: {
        secSym: '§ 22.',
        shortTitle: 'Дифракція Фраунгофера на одиночній щілині',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Оптика, хвильовий фронт та електромагнетизм',
        badge: 'Дифракція',
        subtitle: 'Огинання світловим фронтом країв вузької щілини, зони Гюйгенса та центральний дифракційний максимум',
        secTag: 'Параграф § 22 — Хвильова оптика · Принцип Гюйгенса — Френеля і дифракція',
        title: 'Дифракція світлового фронту на вузькій щілині',
        epigraph: 'Коли ширина щілини стає сумірною з довжиною хвилі, світловий пучок не звужується, а навпаки — розширюється у дифракційний спектр.',
        figCaption: 'Рис. 22.1 — Розподіл енергії між центральним дифракційним максимумом та бічними пелюстками sinc²(β)',
        ekLabel: 'Центр. пік I(0)',
        epLabel: 'Ширина 2y₁',
        qLabel: 'Бічні максимуми',
        cameraPos: [0, 5.8, 14.5],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          b \sin\theta_{\min} &= \pm m \lambda \quad (m = 1, 2, 3, \dots) \\
          I(\theta) &= I_0 \left(\frac{\sin\beta}{\beta}\right)^2, \qquad \beta = \frac{\pi b \sin\theta}{\lambda}, \qquad \Delta y_{\text{центр}} = \frac{2\lambda L}{b}
        \end{aligned}`,
        question: 'Паралельний монохроматичний світловий фронт падає на вузьку вертикальну щілину шириною $b$. Що відбудеться з шириною центрального світлого максимуму $\\Delta y_{\\text{центр}}$ на екрані, якщо ширину щілини $b$ поступово **зменшувати**?',
        options: [
          'Центральна світла смуга на екрані пропорційно звужуватиметься',
          'За умовою першого дифракційного мінімуму $\\sin\\theta_1 = \\lambda / b$, при звуженні щілини кут розходження зростає, і центральний максимум на екрані **розширюється** ($\\Delta y = 2\\lambda L / b$)',
          'Ширина дифракційної картини залежить лише від відстані до джерела світла'
        ],
        correctIndex: 1,
        explanation: 'Згідно з принципом Гюйгенса — Френеля вторинні когерентні хвилі від країв щілини гасять одна одну у напрямках, де $b\\sin\\theta = \\pm m\\lambda$. Тому напівширина центрального максимуму визначається першим мінімумом ($m=1$): $y_1 \\approx \\frac{\\lambda L}{b}$. Зменшення ширини щілини $b$ призводить до сильнішого дифракційного розходження хвильового фронту і розширення центрального піка $\\Delta y = \\frac{2\\lambda L}{b}$!',
        formulaLatex: String.raw`b\sin\theta_m = m\lambda, \qquad \Delta y_{\text{центр}} = \frac{2\lambda L}{b}, \qquad I(\theta) = I_0\left(\frac{\sin\beta}{\beta}\right)^2`,
        liveLatexFn: p => {
          const sinTheta1 = (p.wavelength * 1e-3) / p.slitWidth;
          const centralW = (2 * p.wavelength * 1e-3 * p.screenDist) / p.slitWidth;
          return String.raw`b = ${p.slitWidth.toFixed(1)}\text{ мкм}, \quad \sin\theta_1 = ${sinTheta1.toFixed(2)}, \quad \Delta y_{\text{центр}} = ${centralW.toFixed(2)}\text{ см}`;
        },
        defaults: { slitWidth: 2.2, wavelength: 550, screenDist: 4.5, orderM: 1 },
        sliders: [
          { key: 'slitWidth', label: 'Ширина дифракційної щілини b', min: 1.2, max: 4.5, step: 0.2, unit: 'мкм' },
          { key: 'wavelength', label: 'Довжина світлової хвилі λ', min: 400, max: 700, step: 20, unit: 'нм' },
          { key: 'screenDist', label: 'Відстань до екрана L', min: 3.0, max: 6.5, step: 0.5, unit: 'м' },
          { key: 'orderM', label: 'Порядок дифракційного мінімуму m', min: 1, max: 3, step: 1, unit: '' }
        ]
      },

      carnot: {
        secSym: '§ 23.',
        shortTitle: 'Тепловий двигун та цикл Карно',
        category: 'thermo',
        categoryGroupTitle: 'Розділ ІІ. Гідростатика, аеродинаміка та термодинаміка',
        badge: 'Термодинаміка',
        subtitle: 'Перетворення теплоти нагрівника Q₁ на механічну роботу поршня A та передача Q₂ холодильнику',
        secTag: 'Параграф § 23 — Другий закон термодинаміки · Цикл Карно та ККД двигуна',
        title: 'Ідеальна теплова машина та цикл Карно у 3D',
        epigraph: 'Неможливо перетворити всю теплоту нагрівника на роботу без передачі частини тепла холодильнику: максимальний ККД визначається температурами T₁ і T₂.',
        figCaption: 'Рис. 23.1 — Енергетичний потік теплової машини: Q₁ = A_корисн + Q₂ та термічний ККД η_Карно',
        ekLabel: 'Корисна робота A',
        epLabel: 'Теплота нагрівника Q₁',
        qLabel: 'Віддано холодильнику Q₂',
        cameraPos: [0, 5.6, 14.5],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          Q_1 &= A + Q_2, \qquad \eta = \frac{A}{Q_1} = \frac{Q_1 - Q_2}{Q_1} \\
          \eta_{\text{Карно}} &= 1 - \frac{T_2}{T_1}, \qquad A_{\max} = Q_1 \left(1 - \frac{T_2}{T_1}\right)
        \end{aligned}`,
        question: 'Ідеальна теплова машина працює за циклом Карно між нагрівником із температурою $T_1 = 600\\text{ К}$ та холодильником із температурою $T_2 = 300\\text{ К}$, отримуючи за цикл $Q_1 = 120\\text{ Дж}$ теплоти. Яку максимальну механічну роботу $A$ може виконати поршень за один цикл?',
        options: [
          'Усі $120\\text{ Дж}$ теплоти повністю перейдуть у механічну роботу ($\\eta = 100\\%$)',
          'ККД циклу Карно становить $\\eta = 1 - T_2/T_1 = 50\\%$, тому в корисну роботу перейде $A = 60\\text{ Дж}$, а решта $Q_2 = 60\\text{ Дж}$ обов’язково передається холодильнику',
          'Корисна робота дорівнює різниці температур $600 - 300 = 300\\text{ Дж}$'
        ],
        correctIndex: 1,
        explanation: 'За теоремою Карно жодна теплова машина не може мати ККД вищий за $\\eta_{\\text{Карно}} = 1 - \\frac{T_2}{T_1}$. При $T_1 = 600\\text{ К}$ та $T_2 = 300\\text{ К}$ термічний ККД дорівнює $\\eta = 1 - 300/600 = 0.5$ ($50\\%$). Отже, з кожних $Q_1 = 120\\text{ Дж}$ теплоти нагрівника поршень виконує роботу $A = \\eta Q_1 = 60\\text{ Дж}$, а $Q_2 = Q_1 - A = 60\\text{ Дж}$ відводиться холодильнику для замикання циклу.',
        formulaLatex: String.raw`\eta_{\text{Карно}} = 1 - \frac{T_2}{T_1}, \qquad A = \eta_{\text{Карно}} Q_1, \qquad Q_2 = Q_1 - A`,
        liveLatexFn: p => {
          const eta = Math.max(0.05, 1 - p.tempCold / p.tempHot);
          const workA = p.heatQ1 * eta;
          const q2 = p.heatQ1 - workA;
          return String.raw`\eta = ${(eta * 100).toFixed(1)}\%, \quad A = ${workA.toFixed(1)}\text{ Дж}, \quad Q_2 = ${q2.toFixed(1)}\text{ Дж}`;
        },
        defaults: { tempHot: 600, tempCold: 300, heatQ1: 120, rpmSpeed: 1.8 },
        sliders: [
          { key: 'tempHot', label: 'Температура нагрівника T₁', min: 450, max: 900, step: 25, unit: 'К' },
          { key: 'tempCold', label: 'Температура холодильника T₂', min: 200, max: 400, step: 25, unit: 'К' },
          { key: 'heatQ1', label: 'Теплота від нагрівника за цикл Q₁', min: 60, max: 200, step: 10, unit: 'Дж' },
          { key: 'rpmSpeed', label: 'Частота термодинамічного циклу ν', min: 0.8, max: 3.2, step: 0.2, unit: 'Гц' }
        ]
      },

      viscosity: {
        secSym: '§ 24.',
        shortTitle: 'Формула Стокса: гранична швидкість у рідині',
        category: 'thermo',
        categoryGroupTitle: 'Розділ ІІ. Гідростатика, аеродинаміка та термодинаміка',
        badge: 'В’язкість',
        subtitle: 'Падіння кульки у в’язкому маслі, сила в’язкого тертя Стокса та встановлення усталеної швидкості',
        secTag: 'Параграф § 24 — Механіка реальних рідин · Закон Стокса та гранична швидкість',
        title: 'Рух кулі у в’язкій рідині (Закон Стокса)',
        epigraph: 'Коли сума сили Архімеда та сили в’язкого опору Стокса зрівноважує силу тяжіння, прискорення зникає і куля падає зі сталою граничною швидкістю.',
        figCaption: 'Рис. 24.1 — Перехід потенціальної енергії кулі в кінетичну та дисипативне тепло в’язкого тертя',
        ekLabel: 'Кінетична E_k',
        epLabel: 'Потенціальна E_p',
        qLabel: 'Робота в’язкості Q',
        cameraPos: [0, 5.4, 13.8],
        cameraTarget: [0, 2.5, 0],
        referenceLatex: String.raw`\begin{aligned}
          F_{\text{Стокса}} &= 6\pi \eta r v, \qquad m\frac{dv}{dt} = mg - F_A - 6\pi\eta r v \\
          v_{\text{уст}} &= \frac{2 r^2 g (\rho_{\text{тіла}} - \rho_{\text{рід}})}{9\eta}
        \end{aligned}`,
        question: 'Сталева кулька радіусом $r$ опускається у високий циліндр із в’язким гліцерином ($\\eta$). Як зміниться усталена (гранична) швидкість падіння кульки $v_{\\text{уст}}$, якщо взяти кульку з того самого матеріалу, але з **удвічі більшим радіусом** $2r$?',
        options: [
          'Гранична швидкість не зміниться, бо всі тіла падають однаково',
          'Оскільки маса та виштовхувальна сила ростуть пропорційно об’єму $r^3$, а сила опору Стокса $F_c = 6\\pi\\eta r v$ — лише пропорційно $r$, гранична швидкість зросте **в 4 рази** ($v_{\\text{уст}} \\propto r^2 / \\eta$)',
          'Більша кулька падатиме повільніше через більший опір середовища'
        ],
        correctIndex: 1,
        explanation: 'На кульку в рідині діють три сили: тяжіння $F_g = \\frac{4}{3}\\pi r^3 \\rho_{\\text{т}} g$ вниз, сила Архімеда $F_A = \\frac{4}{3}\\pi r^3 \\rho_{\\text{р}} g$ вгору та сила в’язкого опору Стокса $F_c = 6\\pi\\eta r v$ вгору. В усталеному режимі $F_g - F_A = F_c$, звідки **формула Стокса** для граничної швидкості: $v_{\\text{уст}} = \\frac{2 r^2 g (\\rho_{\\text{т}} - \\rho_{\\text{р}})}{9\\eta}$. Отже, $v_{\\text{уст}}$ пропорційна квадрату радіуса $r^2$ і обернено пропорційна в’язкості $\\eta$.',
        formulaLatex: String.raw`F_c = 6\pi\eta r v, \qquad v_{\text{уст}} = \frac{2 r^2 g (\rho_{\text{т}} - \rho_{\text{р}})}{9\eta}, \qquad v(t) = v_{\text{уст}}\left(1 - e^{-t/\tau}\right)`,
        liveLatexFn: p => {
          const vTerm = (2 * Math.pow(p.radiusR * 0.01, 2) * 9.81 * (p.rhoSphere - p.rhoFluid)) / (9 * p.viscosityEta);
          return String.raw`r = ${p.radiusR.toFixed(2)}\text{ см}, \quad \eta = ${p.viscosityEta.toFixed(1)}\text{ Па}\cdot\text{с}, \quad v_{\text{уст}} = ${vTerm.toFixed(3)}\text{ м/с}`;
        },
        defaults: { radiusR: 0.42, viscosityEta: 1.2, rhoSphere: 2600, rhoFluid: 950 },
        sliders: [
          { key: 'radiusR', label: 'Радіус кульки r', min: 0.25, max: 0.65, step: 0.05, unit: 'см' },
          { key: 'viscosityEta', label: 'Динамічна в’язкість рідини η', min: 0.4, max: 2.8, step: 0.2, unit: 'Па·с' },
          { key: 'rhoSphere', label: 'Густина матеріалу кулі ρ_тіла', min: 1500, max: 4000, step: 250, unit: 'кг/м³' },
          { key: 'rhoFluid', label: 'Густина в’язкої рідини ρ_рід', min: 700, max: 1250, step: 50, unit: 'кг/м³' }
        ]
      },

      coulomb: {
        secSym: '§ 25.',
        shortTitle: 'Закон Кулона та поле електричного диполя',
        category: 'electro',
        categoryGroupTitle: 'Розділ ІV. Електродинаміка та магнітне поле',
        badge: 'Електростатика',
        subtitle: 'Силові лінії напруженості E двох точкових зарядів, закон Кулона та рух пробного заряду',
        secTag: 'Параграф § 25 — Електростатика · Закон Кулона та суперпозиція полів',
        title: 'Закон Кулона та 3D-поле електричного диполя',
        epigraph: 'Силові лінії електростатичного поля починаються на додатних зарядах і закінчуються на від’ємних, а в кожній точці простору вектор E є геометричною сумою полів усіх зарядів.',
        figCaption: 'Рис. 25.1 — Робота кулонівського поля з переміщення пробного заряду q₀ вздовж силової лінії',
        ekLabel: 'Кінетична E_k(q₀)',
        epLabel: 'Енергія поля W_e',
        qLabel: 'Сила Кулона |F_C|',
        cameraPos: [0, 6.2, 14.5],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          F_{\text{Кулона}} &= \frac{1}{4\pi\varepsilon_0}\frac{|q_1 q_2|}{r^2}, \qquad \vec{E}(\vec{r}) = \vec{E}_1(\vec{r}) + \vec{E}_2(\vec{r}) \\
          \varphi(\vec{r}) &= k\left(\frac{q_1}{r_1} + \frac{q_2}{r_2}\right), \qquad \vec{F}_0 = q_0 \vec{E}
        \end{aligned}`,
        question: 'Два різнойменні точкові заряди $+q_1$ та $-|q_2|$ розташовані на відстані $d$ один від одного. Як зміниться сила кулонівського притягання $F_{\\text{Кулона}}$ між ними, якщо відстань $d$ зменшити вдвічі, і куди напрямлений вектор напруженості поля $\\vec{E}$ у точці рівно посередині між зарядами?',
        options: [
          'Сила зросте у 2 рази, а посередині між зарядами поле дорівнює нулю',
          'За законом Кулона $F \\propto 1/d^2$ сила зросте в 4 рази, а посередині між $+q_1$ і $-|q_2|$ вектори $\\vec{E}_1$ та $\\vec{E}_2$ додаються і спрямовані від плюса до мінуса',
          'Сила зменшиться в 4 рази, а силові лінії замкнені у кільця'
        ],
        correctIndex: 1,
        explanation: 'За **законом Кулона** сила взаємодії точкових зарядів обернено пропорційна квадрату відстані: $F = k\\frac{|q_1 q_2|}{d^2}$, тому зменшення $d$ удвічі збільшує силу в 4 рази. У точці посередині між додатним і від’ємним зарядами вектор $\\vec{E}_1$ (від $+q_1$) та вектор $\\vec{E}_2$ (до $-|q_2|$) мають **однаковий напрямок** (від $+$ до $-$), тому за принципом суперпозиції вони взаємно підсилюються!',
        formulaLatex: String.raw`F_C = k \frac{|q_1 q_2|}{d^2}, \qquad E_{\text{центр}} = \frac{4k(|q_1| + |q_2|)}{d^2}`,
        liveLatexFn: p => {
          const kScaled = 8.99;
          const force = (kScaled * Math.abs(p.q1 * p.q2)) / (p.distanceD * p.distanceD);
          const eMid = (4 * kScaled * (Math.abs(p.q1) + Math.abs(p.q2))) / (p.distanceD * p.distanceD);
          return String.raw`d = ${p.distanceD.toFixed(1)}\text{ м}, \quad F_C = ${force.toFixed(2)}\text{ мН}, \quad E_{\text{центр}} = ${eMid.toFixed(1)}\text{ кВ/м}`;
        },
        defaults: { q1: 2.5, q2: -2.5, distanceD: 4.4, testChargeQ: 1.0 },
        sliders: [
          { key: 'q1', label: 'Лівий точковий заряд q₁ (+)', min: 1.0, max: 4.5, step: 0.5, unit: 'мкКл' },
          { key: 'q2', label: 'Правий точковий заряд q₂ (−)', min: -4.5, max: -1.0, step: 0.5, unit: 'мкКл' },
          { key: 'distanceD', label: 'Відстань між зарядами d', min: 2.8, max: 6.4, step: 0.4, unit: 'м' },
          { key: 'testChargeQ', label: 'Пробний заряд у полі q₀', min: 0.5, max: 2.5, step: 0.25, unit: 'мкКл' }
        ]
      },

      rlccircuit: {
        secSym: '§ 26.',
        shortTitle: 'Коливальний контур Томпсона (LC / RLC)',
        category: 'electro',
        categoryGroupTitle: 'Розділ ІV. Електродинаміка та магнітне поле',
        badge: 'Контур LC',
        subtitle: 'Вільні електромагнітні коливання між конденсатором C та котушкою індуктивності L, формула Томпсона',
        secTag: 'Параграф § 26 — Електромагнітні коливання · Коливальний контур і формула Томпсона',
        title: 'Електромагнітні коливання в контурі LC / RLC',
        epigraph: 'У коливальному контурі енергія електричного поля конденсатора періодично перетворюється на енергію магнітного поля котушки зі струмом.',
        figCaption: 'Рис. 26.1 — Перетікання електричної енергії конденсатора W_E = q²/(2C) у магнітну енергію котушки W_B = LI²/2',
        ekLabel: 'Магнітна W_B = LI²/2',
        epLabel: 'Електрична W_E = CU²/2',
        qLabel: 'Втрати на опорі Q_R',
        cameraPos: [0, 5.6, 14.2],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          T &= 2\pi\sqrt{LC}, \qquad \omega_0 = \frac{1}{\sqrt{LC}} \quad (\text{формула Томпсона}) \\
          W &= W_E + W_B = \frac{q^2}{2C} + \frac{L I^2}{2}, \qquad q(t) = q_0 e^{-\gamma t}\cos(\omega t)
        \end{aligned}`,
        question: 'Ідеальний коливальний контур складається з конденсатора ємністю $C$ та котушки індуктивністю $L$. У початковий момент конденсатор повністю заряджений ($U = U_0$, струм $I = 0$). Що відбувається в момент, коли конденсатор повністю розряджається ($q = 0$)?',
        options: [
          'Струм у котушці також стає рівним нулю і коливання припиняються',
          'Через явище самоіндукції струм у котушці досягає максимуму $I_{\\max} = U_0\\sqrt{C/L}$, а вся енергія контуру зосереджена в магнітному полі котушки $W_B = \\frac{1}{2}LI_{\\max}^2$',
          'Період коливань залежить лише від початкової напруги $U_0$'
        ],
        correctIndex: 1,
        explanation: 'Коли заряд на обкладках конденсатора спадає до нуля ($q = 0, W_E = 0$), за законом збереження енергії вся початкова електрична енергія $\\frac{1}{2}CU_0^2$ переходить у магнітне поле котушки $\\frac{1}{2}LI_{\\max}^2$. Струм у цей момент є максимальним і завдяки самоіндукції продовжує текти, перезаряджаючи конденсатор протилежним знаком з періодом Томпсона $T = 2\\pi\\sqrt{LC}$.',
        formulaLatex: String.raw`T = 2\pi\sqrt{LC}, \qquad W_{E,\max} = \frac{C U_0^2}{2} = \frac{L I_{\max}^2}{2}, \qquad I_{\max} = U_0\sqrt{\frac{C}{L}}`,
        liveLatexFn: p => {
          const T = 2 * Math.PI * Math.sqrt(p.inductanceL * p.capacitanceC * 0.01);
          const wMax = 0.5 * p.capacitanceC * p.voltageU0 * p.voltageU0 * 0.1;
          const iMax = p.voltageU0 * Math.sqrt(p.capacitanceC / p.inductanceL);
          return String.raw`T = ${T.toFixed(2)}\text{ с}, \quad I_{\max} = ${iMax.toFixed(2)}\text{ А}, \quad W_{\max} = ${wMax.toFixed(1)}\text{ Дж}`;
        },
        defaults: { inductanceL: 2.0, capacitanceC: 2.0, resistanceR: 0.05, voltageU0: 5.0 },
        sliders: [
          { key: 'inductanceL', label: 'Індуктивність котушки L', min: 0.8, max: 4.0, step: 0.2, unit: 'Гн' },
          { key: 'capacitanceC', label: 'Електроємність конденсатора C', min: 0.8, max: 4.0, step: 0.2, unit: 'мФ' },
          { key: 'resistanceR', label: 'Активний опір контуру R (згасання)', min: 0.0, max: 0.5, step: 0.05, unit: 'Ом' },
          { key: 'voltageU0', label: 'Початкова напруга на конденсаторі U₀', min: 2.0, max: 8.0, step: 0.5, unit: 'В' }
        ]
      },

      atwood: {
        secSym: '§ 27.',
        shortTitle: 'Машина Атвуда та інерція блока',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та закони збереження',
        badge: 'Машина Атвуда',
        subtitle: 'Рух зв’язаних тіл на невагомій нитці через масивний блок з моментом інерції I',
        secTag: 'Параграф § 27 — Динаміка зв’язаних тіл · Машина Атвуда та обертання блока',
        title: 'Машина Атвуда: прискорення та натяг нитки',
        epigraph: 'Якщо блок має скінченний момент інерції I, сили натягу нитки з обох боків є різними, створюючи обертальний момент.',
        figCaption: 'Рис. 27.1 — Лабораторна машина Атвуда з вертикальною шкалою, блоком масою M_б та тягарцями m₁ і m₂',
        ekLabel: 'Кінетична E_k (вантажів + блока)',
        epLabel: 'Потенціальна E_p (гравітаційна)',
        qLabel: 'Втрати на тертя осі Q',
        cameraPos: [0, 5.8, 14.5],
        cameraTarget: [0, 3.6, 0],
        referenceLatex: String.raw`\begin{aligned}
          a &= \frac{(m_1 - m_2)g}{m_1 + m_2 + I/R^2}, \qquad I = \frac{1}{2} M_{\text{б}} R^2 \\
          T_1 &= m_1(g - a), \qquad T_2 = m_2(g + a), \qquad (T_1 - T_2)R = I\varepsilon
        \end{aligned}`,
        question: 'На машині Атвуда підвішено два вантажі з масами $m_1 > m_2$ через однорідний суцільний блок масою $M_{\\text{б}}$. Як співвідносяться сили натягу нитки $T_1$ (біля важчого вантажу) та $T_2$ (біля легшого вантажу) під час прискореного руху?',
        options: [
          'Натяги однакові $T_1 = T_2 = \\frac{2m_1 m_2}{m_1 + m_2}g$ незалежно від маси блока',
          'Натяг біля важчого тіла більший ($T_1 > T_2$), оскільки різниця $(T_1 - T_2)R = I\\varepsilon$ розкручує масивний блок, але при цьому $m_2 g < T_2 < T_1 < m_1 g$',
          'Натяг $T_1$ дорівнює вазі $m_1 g$, а $T_2$ дорівнює $m_2 g$'
        ],
        correctIndex: 1,
        explanation: 'Щоб важчий вантаж $m_1$ опускався з прискоренням $a$ вниз, має виконуватися $m_1 g > T_1$. Щоб легший вантаж $m_2$ підіймався вгору з тим самим прискоренням $a$, має бути $T_2 > m_2 g$. А щоб масивний блок набував кутового прискорення $\\varepsilon = a/R$, потрібна додатна різниця моментів сил $(T_1 - T_2)R = I\\varepsilon$, звідки $m_2 g < T_2 < T_1 < m_1 g$.',
        formulaLatex: String.raw`a = \frac{(m_1 - m_2)g}{m_1 + m_2 + \frac{1}{2}M_{\text{б}}}, \qquad T_1 = m_1(g - a), \qquad T_2 = m_2(g + a)`,
        liveLatexFn: p => {
          const g = 9.81;
          const mEff = p.mass1 + p.mass2 + 0.5 * p.pulleyMass;
          const a = ((p.mass1 - p.mass2) * g) / mEff;
          const T1 = p.mass1 * (g - a);
          const T2 = p.mass2 * (g + a);
          return String.raw`a = ${a.toFixed(2)}\text{ м/с}^2, \quad T_1 = ${T1.toFixed(1)}\text{ Н}, \quad T_2 = ${T2.toFixed(1)}\text{ Н}`;
        },
        defaults: { mass1: 3.2, mass2: 1.8, pulleyMass: 1.0, pulleyRadius: 0.8 },
        sliders: [
          { key: 'mass1', label: 'Маса лівого вантажу m₁', min: 1.0, max: 5.0, step: 0.2, unit: 'кг' },
          { key: 'mass2', label: 'Маса правого вантажу m₂', min: 1.0, max: 5.0, step: 0.2, unit: 'кг' },
          { key: 'pulleyMass', label: 'Маса шківа блока M_б', min: 0.0, max: 4.0, step: 0.2, unit: 'кг' },
          { key: 'pulleyRadius', label: 'Радіус блока R', min: 0.5, max: 1.2, step: 0.1, unit: 'м' }
        ]
      },

      coriolis: {
        secSym: '§ 28.',
        shortTitle: 'Сила Коріоліса на обертовій платформі',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та закони збереження',
        badge: 'Неінерціальні СВ',
        subtitle: 'Відхилення траєкторії тіла в системі відліку, що обертається з кутовою швидкістю ω',
        secTag: 'Параграф § 28 — Неінерціальні системи відліку · Сила інерції Коріоліса',
        title: 'Сила Коріоліса та траєкторія на диску, що обертається',
        epigraph: 'Для нерухомого спостерігача куля котиться по прямій, але на обертовій платформі її слід вигинається у спіраль.',
        figCaption: 'Рис. 28.1 — Прямолінійний рух кулі в інерціальній системі та викривлений слід на платформі, що обертається',
        ekLabel: 'Поступальна енергія кулі E_k',
        epLabel: 'Обертальна енергія диска E_об',
        qLabel: 'Робота сили Коріоліса A_Кор = 0',
        cameraPos: [0, 8.8, 12.2],
        cameraTarget: [0, 1.0, 0],
        referenceLatex: String.raw`\begin{aligned}
          \vec{F}_{\text{Кор}} &= -2m[\vec{\omega} \times \vec{v}_{\text{відн}}], \qquad F_{\text{Кор}} = 2m\omega v_{\text{відн}}\sin\alpha \\
          \vec{F}_{\text{вдц}} &= m\omega^2 \vec{r}, \qquad A_{\text{Кор}} = \int \vec{F}_{\text{Кор}}\cdot d\vec{r}_{\text{відн}} = 0
        \end{aligned}`,
        question: 'Горизонтальний диск обертається проти годинникової стрілки (як якщо дивитися згори на Північний полюс Землі, $\\vec{\\omega}$ напрямлена вгору). Із центра диска вздовж радіуса запускають кульку зі швидкістю $\\vec{v}_{\\text{відн}}$. Куди відхиляється кулька відносно радіуса платформи?',
        options: [
          'Праворуч за ходом руху (відстаючи від обертання платформи), оскільки $\\vec{F}_{\\text{Кор}} = -2m[\\vec{\\omega}\\times\\vec{v}_{\\text{відн}}]$',
          'Ліворуч за ходом руху (випереджаючи платформу)',
          'Рухається строго вздовж радіальної лінії, намальованої на платформі'
        ],
        correctIndex: 0,
        explanation: 'За правилом векторного добутку, якщо вектор $\\vec{\\omega}$ напрямлений вертикально вгору, то вектор $[\\vec{\\omega}\\times\\vec{v}_{\\text{відн}}]$ повернутий на $90^\\circ$ ліворуч від $\\vec{v}_{\\text{відн}}$, а отже сила Коріоліса $\\vec{F}_{\\text{Кор}} = -2m[\\vec{\\omega}\\times\\vec{v}_{\\text{відн}}]$ завжди відхиляє тіло праворуч за ходом руху в Північній півкулі (закон Бера).',
        formulaLatex: String.raw`F_{\text{Кор}} = 2m\omega v_{\text{відн}}, \qquad a_{\text{Кор}} = 2\omega v_{\text{відн}}, \qquad \Delta s \approx \omega v_0 t^2`,
        liveLatexFn: p => {
          const aCor = 2 * p.omegaDisk * p.ballSpeed;
          const fCor = p.ballMass * aCor;
          return String.raw`a_{\text{Кор}} = 2\omega v = ${aCor.toFixed(2)}\text{ м/с}^2, \quad F_{\text{Кор}} = ${fCor.toFixed(2)}\text{ Н}`;
        },
        defaults: { omegaDisk: 1.2, ballSpeed: 2.5, ballMass: 1.5, launchRadius: 0.2 },
        sliders: [
          { key: 'omegaDisk', label: 'Кутова швидкість платформи ω', min: -2.4, max: 2.4, step: 0.2, unit: 'рад/с' },
          { key: 'ballSpeed', label: 'Радіальна швидкість кулі v₀', min: 1.2, max: 4.0, step: 0.2, unit: 'м/с' },
          { key: 'ballMass', label: 'Маса кулі m', min: 0.5, max: 3.0, step: 0.25, unit: 'кг' },
          { key: 'launchRadius', label: 'Початкове зміщення від центра r₀', min: 0.0, max: 1.5, step: 0.25, unit: 'м' }
        ]
      },

      hooke: {
        secSym: '§ 29.',
        shortTitle: 'Закон Гука та модуль Юнга',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та закони збереження',
        badge: 'Деформація',
        subtitle: 'Механічна напруга σ, відносне видовження ε та модуль пружності Юнга E при розтягу стрижня',
        secTag: 'Параграф § 29 — Механіка деформівного твердого тіла · Закон Гука та модуль Юнга',
        title: 'Механічна напруга та модуль Юнга при розтягу',
        epigraph: 'Механічна напруга в межах пружності прямо пропорційна відносному видовженню зразка: σ = E·ε.',
        figCaption: 'Рис. 29.1 — Лабораторна розривна машина з мікрометричним індикатором для вимірювання модуля Юнга E',
        ekLabel: 'Кінетична енергія коливань E_k',
        epLabel: 'Пружна енергія деформації W_пр',
        qLabel: 'Внутрішнє тертя в матеріалі Q',
        cameraPos: [0, 5.4, 13.5],
        cameraTarget: [0, 3.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          \sigma &= \frac{F}{S} = E\varepsilon, \qquad \varepsilon = \frac{\Delta l}{l_0}, \qquad \Delta l = \frac{F l_0}{E S} \\
          k &= \frac{E S}{l_0}, \qquad W_{\text{пр}} = \frac{1}{2} F \Delta l = \frac{1}{2} E \varepsilon^2 V
        \end{aligned}`,
        question: 'Два дроти з однакового матеріалу (модуль Юнга $E$) мають однакову довжину $l_0$ і розтягуються однаковою силою $F$, але діаметр другого дроту вдвічі більший ($d_2 = 2d_1$). У скільки разів відрізнятиметься їхнє абсолютне видовження $\\Delta l$?',
        options: [
          'Видовження другого дроту буде вдвічі меншим ($\\Delta l_2 = \\Delta l_1 / 2$)',
          'Видовження другого дроту буде в 4 рази меншим ($\\Delta l_2 = \\Delta l_1 / 4$), бо площа перерізу $S = \\pi d^2 / 4$ зросла вчетверо',
          'Видовження буде однаковим, оскільки обидва дроти виготовлені з одного металу'
        ],
        correctIndex: 1,
        explanation: 'Із закону Гука $\\Delta l = \\frac{F l_0}{E S}$. Площа поперечного перерізу круглого стрижня пропорційна квадрату діаметра: $S = \\frac{\\pi d^2}{4}$. Тому збільшення діаметра вдвічі збільшує площу перерізу в 4 рази та зменшує механічну напругу $\\sigma = F/S$ і абсолютне видовження $\\Delta l$ рівно в 4 рази.',
        formulaLatex: String.raw`\sigma = \frac{F}{S} = E\frac{\Delta l}{l_0}, \qquad \Delta l = \frac{4 F l_0}{\pi d^2 E}, \qquad W_{\text{пр}} = \frac{F \Delta l}{2}`,
        liveLatexFn: p => {
          const areaMm2 = Math.PI * 0.25 * p.rodDiam * p.rodDiam;
          const sigmaMPa = (p.loadForce * 1000) / areaMm2;
          const strain = sigmaMPa / (p.youngE * 1000);
          const strainPct = strain * 100;
          const dlMm = p.rodLength * 1000 * strain;
          return String.raw`\sigma = ${sigmaMPa.toFixed(1)}\text{ МПа}, \quad \varepsilon = ${strainPct.toFixed(3)}\%, \quad \Delta l = ${dlMm.toFixed(2)}\text{ мм}`;
        },
        defaults: { loadForce: 8.0, youngE: 7.0, rodDiam: 6.0, rodLength: 2.0 },
        sliders: [
          { key: 'loadForce', label: 'Розтягувальне навантаження F', min: 2.0, max: 16.0, step: 0.5, unit: 'кН' },
          { key: 'youngE', label: 'Модуль Юнга матеріалу E', min: 2.0, max: 20.0, step: 1.0, unit: '×10¹⁰ Па' },
          { key: 'rodDiam', label: 'Діаметр зразка d', min: 4.0, max: 10.0, step: 0.5, unit: 'мм' },
          { key: 'rodLength', label: 'Початкова база зразка l₀', min: 1.2, max: 2.8, step: 0.2, unit: 'м' }
        ]
      },

      torricelli: {
        secSym: '§ 30.',
        shortTitle: 'Формула Торрічеллі (витікання з отворів)',
        category: 'thermo',
        categoryGroupTitle: 'Розділ ІІ. Гідроаеромеханіка, МКТ та термодинаміка',
        badge: 'Гідродинаміка',
        subtitle: 'Швидкість витікання ідеальної рідини з малого отвору під дією гідростатичного напору h',
        secTag: 'Параграф § 30 — Наслідки рівняння Бернуллі · Формула Торрічеллі та параболи струменів',
        title: 'Формула Торрічеллі: витікання рідини з резервуара',
        epigraph: 'Рідина, що витікає з малого отвору на глибині h, має таку саму швидкість, яку мало б тіло при вільному падінні з висоти h.',
        figCaption: 'Рис. 30.1 — Гідравлічна колона з трьома соплами на різних глибинах та параболічні траєкторії струменів',
        ekLabel: 'Кінетична енергія струменя ½ρv²',
        epLabel: 'Гідростатичний напір ρgh',
        qLabel: 'Втрати напору у соплі Δp_втр',
        cameraPos: [0, 5.5, 14.5],
        cameraTarget: [0.8, 3.0, 0],
        referenceLatex: String.raw`\begin{aligned}
          v &= \sqrt{2gh}, \qquad t_{\text{пад}} = \sqrt{\frac{2(H - h)}{g}} \\
          x(h) &= v t_{\text{пад}} = 2\sqrt{h(H - h)}, \qquad x_{\max} = H \quad \left(\text{при } h = \frac{H}{2}\right)
        \end{aligned}`,
        question: 'У вертикальній циліндричній посудині, заповненій водою до висоти $H$, просвердлено малі отвори на різних глибинах $h$ від вільної поверхні. На якій глибині $h$ має бути розташований отвір, щоб горизонтальна дальність польоту струменя $x$ на рівень дна посудини була максимальною?',
        options: [
          'Біля самого дна ($h \\to H$), де гідростатичний тиск і швидкість витікання найбільші',
          'Рівно посередині висоти стовпа рідини ($h = H/2$), де дальність досягає максимуму $x_{\\max} = H$',
          'Поблизу поверхні води ($h \\to 0$), де час польоту струменя найбільший'
        ],
        correctIndex: 1,
        explanation: 'Швидкість витікання на глибині $h$ за формулою Торрічеллі дорівнює $v = \\sqrt{2gh}$, а час падіння струменя з висоти $(H - h)$ до рівня дна становить $t = \\sqrt{2(H - h)/g}$. Горизонтальна дальність $x = vt = 2\\sqrt{h(H - h)}$ є симетричною відносно $h$ та $(H - h)$ і досягає максимуму $x_{\\max} = H$ рівно посередині резервуара при $h = H/2$.',
        formulaLatex: String.raw`v = \sqrt{2gh}, \qquad x = 2\sqrt{h(H - h)}, \qquad x_{\max} = H \;\; (h = H/2)`,
        liveLatexFn: p => {
          const g = 9.81;
          const h = Math.min(p.waterLevelH - 0.15, p.nozzleDepthH);
          const v = p.dischargeMu * Math.sqrt(Math.max(0, 2 * g * h));
          const xRange = 2 * p.dischargeMu * Math.sqrt(Math.max(0, h * (p.waterLevelH - h)));
          return String.raw`h = ${h.toFixed(2)}\text{ м}, \quad v = \varphi\sqrt{2gh} = ${v.toFixed(2)}\text{ м/с}, \quad x = ${xRange.toFixed(2)}\text{ м}`;
        },
        defaults: { waterLevelH: 4.4, nozzleDepthH: 2.2, dischargeMu: 0.98, liquidRho: 1.0 },
        sliders: [
          { key: 'waterLevelH', label: 'Рівень води в башті H', min: 2.6, max: 5.0, step: 0.2, unit: 'м' },
          { key: 'nozzleDepthH', label: 'Глибина досліджуваного сопла h', min: 0.4, max: 4.2, step: 0.2, unit: 'м' },
          { key: 'dischargeMu', label: 'Коефіцієнт швидкості сопла φ', min: 0.80, max: 1.00, step: 0.02, unit: '' },
          { key: 'liquidRho', label: 'Густина рідини ρ', min: 0.8, max: 1.8, step: 0.1, unit: 'г/см³' }
        ]
      },

      maxwell: {
        secSym: '§ 31.',
        shortTitle: 'Розподіл Максвелла за швидкостями молекул',
        category: 'thermo',
        categoryGroupTitle: 'Розділ ІІ. Гідроаеромеханіка, МКТ та термодинаміка',
        badge: 'Стат. фізика',
        subtitle: 'Статистичний закон розподілу молекул ідеального газу за модулями швидкостей та характерні швидкості',
        secTag: 'Параграф § 31 — Молекулярно-кінетична теорія · Закон розподілу Максвелла',
        title: 'Розподіл Максвелла та характерні швидкості газу',
        epigraph: 'Хаотичні зіткнення міріад молекул формують строго визначений статистичний профіль густини ймовірності f(v).',
        figCaption: 'Рис. 31.1 — 3D-гістограма розподілу молекул за швидкостями f(v) та характерні швидкості v_p < ⟨v⟩ < v_кв',
        ekLabel: 'Середня кінетична енергія (3/2)kT',
        epLabel: 'Частка швидких молекул (v > v_кв)',
        qLabel: 'Ширина купола розподілу Δv',
        cameraPos: [0, 5.8, 14.2],
        cameraTarget: [0, 2.5, 0],
        referenceLatex: String.raw`\begin{aligned}
          f(v) &= 4\pi\left(\frac{M}{2\pi RT}\right)^{3/2} v^2 \exp\!\left(-\frac{Mv^2}{2RT}\right) \\
          v_p &= \sqrt{\frac{2RT}{M}} \;<\; \langle v\rangle = \sqrt{\frac{8RT}{\pi M}} \;<\; v_{\text{кв}} = \sqrt{\frac{3RT}{M}}
        \end{aligned}`,
        question: 'Як змінюється форма кривої розподілу Максвелла $f(v)$ при підвищенні абсолютної температури газу $T$ (при незмінній загальній кількості молекул)?',
        options: [
          'Максимум кривої зміщується в бік більших швидкостей ($v_p \\propto \\sqrt{T}$), а висота максимуму знижується, бо площа під кривою завжди дорівнює одиниці ($\\int_0^\\infty f(v)\\,dv = 1$)',
          'Максимум кривої росте вгору на тій самій швидкості $v_p$',
          'Усі молекули набувають однакової швидкості $v_{\\text{кв}}$ і крива звужується в лінію'
        ],
        correctIndex: 0,
        explanation: 'Оскільки умова нормування $\\int_0^\\infty f(v)\\,dv = 1$ зберігає площу під графіком незмінною, при нагріванні газу найбільш імовірна швидкість $v_p = \\sqrt{2RT/M}$ зростає, крива розширюється праворуч, а її пікове значення $f(v_p) \\propto 1/\\sqrt{T}$ відповідно зменшується.',
        formulaLatex: String.raw`v_p = \sqrt{\frac{2RT}{M}}, \qquad \langle v\rangle \approx 1.128\,v_p, \qquad v_{\text{кв}} \approx 1.225\,v_p`,
        liveLatexFn: p => {
          const R = 8.314;
          const mKg = p.molarMassM * 0.001;
          const vp = Math.sqrt((2 * R * p.gasTempT) / mKg);
          const vAvg = Math.sqrt((8 * R * p.gasTempT) / (Math.PI * mKg));
          const vRms = Math.sqrt((3 * R * p.gasTempT) / mKg);
          return String.raw`v_p = ${vp.toFixed(0)}\text{ м/с}, \quad \langle v\rangle = ${vAvg.toFixed(0)}\text{ м/с}, \quad v_{\text{кв}} = ${vRms.toFixed(0)}\text{ м/с}`;
        },
        defaults: { gasTempT: 350, molarMassM: 28, particleCount: 90, thresholdRatio: 1.2 },
        sliders: [
          { key: 'gasTempT', label: 'Абсолютна температура газу T', min: 150, max: 900, step: 25, unit: 'К' },
          { key: 'molarMassM', label: 'Молярна маса газу M (4=He, 28=N₂, 44=CO₂)', min: 4, max: 64, step: 4, unit: 'г/моль' },
          { key: 'particleCount', label: 'Число візуалізованих молекул N', min: 40, max: 140, step: 10, unit: 'шт.' },
          { key: 'thresholdRatio', label: 'Поріг активації v_пор / v_p', min: 0.8, max: 2.0, step: 0.1, unit: '' }
        ]
      },

      newtonrings: {
        secSym: '§ 32.',
        shortTitle: 'Кільця Ньютона (інтерференція в тонких плівках)',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Хвильова і геометрична оптика · Рух світлового фронту',
        badge: 'Тонкі плівки',
        subtitle: 'Смуги рівної товщини в клиноподібному повітряному прошарку між плоско-опуклою лінзою та скляною пластиною',
        secTag: 'Параграф § 32 — Хвильова оптика · Інтерференція в тонких плівках та кільця Ньютона',
        title: 'Кільця Ньютона: інтерференція на повітряному прошарку',
        epigraph: 'Концентричні райдужні або монохроматичні кільця навколо точки дотику лінзи безпосередньо вимірюють довжину світлової хвилі.',
        figCaption: 'Рис. 32.1 — Плоско-опукла лінза радіуса кривизни R на оптичному склі та концентричні інтерференційні кільця Ньютона',
        ekLabel: 'Інтенсивність відбитого фронту I_відб',
        epLabel: 'Інтенсивність прохідного фронту I_прох',
        qLabel: 'Втрати на розсіяння',
        cameraPos: [0, 6.2, 13.5],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          \Delta &= 2 d(r) n_0 + \frac{\lambda}{2}, \qquad d(r) \approx \frac{r^2}{2R} \\
          r_m^{\text{темн}} &= \sqrt{\frac{m\lambda R}{n_0}} \;\;(m = 0,1,2\dots), \qquad r_m^{\text{світл}} = \sqrt{\frac{(m - \frac{1}{2})\lambda R}{n_0}}
        \end{aligned}`,
        question: 'Чому в центрі картини кілець Ньютона (у точці безпосереднього оптичного контакту лінзи зі скляною пластиною, де товщина прошарку $d = 0$) у відбитому світлі завжди спостерігається темна пляма?',
        options: [
          'Тому що в точці дотику скло повністю поглинає світло',
          'Тому що при відбитті променя від нижньої оптично густішої межі (повітря $\\to$ скло) фаза хвилі змінюється на $\\pi$, що еквівалентно додатковій різниці ходу $\\Delta = \\lambda/2$ (умова інтерференційного мінімуму)',
          'Тому що промені в центрі зазнають повного внутрішнього відбиття'
        ],
        correctIndex: 1,
        explanation: 'Промінь 1 відбивається від межі «лінза $\\to$ прошарок повітря» (від оптично менш густого середовища) без зміни фази. Промінь 2 відбивається від нижньої межі «повітря $\\to$ скляна пластина» (від оптично густішого середовища) зі стрибком фази на $\\pi$ (втрата півхвилі $\\lambda/2$). При $d = 0$ оптична різниця ходу дорівнює $\\Delta = \\lambda/2$, що дає протифазне гасіння — центральну темну пляму.',
        formulaLatex: String.raw`r_m^{\text{темн}} = \sqrt{\frac{m\lambda R}{n_0}}, \qquad d(r) = \frac{r^2}{2R}, \qquad \Delta = 2n_0 d + \frac{\lambda}{2}`,
        liveLatexFn: p => {
          const rDarkMm = Math.sqrt((p.ringOrderM * (p.lambdaNm * 1e-6) * (p.lensRadiusR * 1000)) / p.gapIndexN);
          const rBrightMm = Math.sqrt(((p.ringOrderM - 0.5) * (p.lambdaNm * 1e-6) * (p.lensRadiusR * 1000)) / p.gapIndexN);
          const dUm = (p.ringOrderM * p.lambdaNm * 0.001) / (2 * p.gapIndexN);
          return String.raw`m = ${p.ringOrderM}, \quad r_{\text{темн}} = ${rDarkMm.toFixed(2)}\text{ мм}, \quad r_{\text{світл}} = ${rBrightMm.toFixed(2)}\text{ мм}, \quad d_m = ${dUm.toFixed(2)}\;\text{мкм}`;
        },
        defaults: { lambdaNm: 550, lensRadiusR: 2.5, gapIndexN: 1.00, ringOrderM: 3 },
        sliders: [
          { key: 'lambdaNm', label: 'Довжина світлової хвилі λ', min: 420, max: 680, step: 10, unit: 'нм' },
          { key: 'lensRadiusR', label: 'Радіус кривизни лінзи R', min: 1.0, max: 5.0, step: 0.25, unit: 'м' },
          { key: 'gapIndexN', label: 'Показник заломлення прошарку n₀', min: 1.00, max: 1.50, step: 0.05, unit: '' },
          { key: 'ringOrderM', label: 'Порядок вимірюваного кільця m', min: 1, max: 6, step: 1, unit: '' }
        ]
      },

      photoelectric: {
        secSym: '§ 33.',
        shortTitle: 'Фотоефект та квантове рівняння Ейнштейна',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Хвильова і геометрична оптика · Рух світлового фронту',
        badge: 'Квантова оптика',
        subtitle: 'Виривання фотоелектронів квантами світла hν, робота виходу A_вих, червона межа та затримуючий потенціал U_з',
        secTag: 'Параграф § 33 — Квантові властивості світла · Зовнішній фотоефект і закони Столєтова–Ейнштейна',
        title: 'Зовнішній фотоефект та рівняння Ейнштейна',
        epigraph: 'Світло випромінюється і поглинається речовиною дискретними порціями — квантами (фотонами) з енергією E = hν.',
        figCaption: 'Рис. 33.1 — Вакуумний фотоелемент з кварцовим вікном: потік фотонів hν вибиває електрони з фотокатода K до анода A',
        ekLabel: 'Макс. кінетична фотоелектронів E_k,max',
        epLabel: 'Робота виходу з металу A_вих',
        qLabel: 'Робота гальмівного поля eU',
        cameraPos: [0, 5.4, 14.0],
        cameraTarget: [0, 2.5, 0],
        referenceLatex: String.raw`\begin{aligned}
          h\nu &= \frac{hc}{\lambda} = A_{\text{вих}} + \frac{m_e v_{\max}^2}{2}, \qquad e U_{\text{з}} = h\nu - A_{\text{вих}} \\
          \nu_{\min} &= \frac{A_{\text{вих}}}{h}, \qquad \lambda_{\max} = \frac{hc}{A_{\text{вих}}} \quad (\text{червона межа фотоефекту})
        \end{aligned}`,
        question: 'Від чого залежить максимальна початкова кінетична енергія фотоелектронів $E_{k,\\max} = \\frac{1}{2}m_e v_{\\max}^2$, що вилітають з освітленого металевого катода?',
        options: [
          'Тільки від частоти падаючого світла $\\nu$ (довжини хвилі $\\lambda$) та роботи виходу металу $A_{\\text{вих}}$ і не залежить від інтенсивності світлового потоку',
          'Прямо пропорційна інтенсивності (яскравості) світлового пучка',
          'Зростає пропорційно часу освітлення катода'
        ],
        correctIndex: 0,
        explanation: 'За другим законом фотоефекту (рівняння Ейнштейна $h\\nu = A_{\\text{вих}} + E_{k,\\max}$) кожен окремий фотон передає свою енергію $h\\nu$ одному електрону. Збільшення інтенсивності світла збільшує кількість вирваних електронів за секунду (силу фотоструму насичення), але максимальна енергія кожного електрона визначається виключно частотою світла $\\nu$ і роботою виходу $A_{\\text{вих}}$.',
        formulaLatex: String.raw`E_{\text{ф}} = \frac{hc}{\lambda}, \qquad E_{k,\max} = \frac{hc}{\lambda} - A_{\text{вих}} = e U_{\text{з}}`,
        liveLatexFn: p => {
          const ePhoton = 1240 / p.wavelengthNm;
          const ekMax = Math.max(0, ePhoton - p.workFuncEv);
          const lambdaMax = 1240 / p.workFuncEv;
          return String.raw`h\nu = ${ePhoton.toFixed(2)}\text{ еВ}, \quad E_{k,\max} = ${ekMax.toFixed(2)}\text{ еВ}, \quad \lambda_{\text{кр}} = ${lambdaMax.toFixed(0)}\text{ нм}`;
        },
        defaults: { wavelengthNm: 380, workFuncEv: 2.2, intensityFlux: 1.5, retardingVolt: 0.4 },
        sliders: [
          { key: 'wavelengthNm', label: 'Довжина хвилі випромінювання λ', min: 250, max: 650, step: 10, unit: 'нм' },
          { key: 'workFuncEv', label: 'Робота виходу катода A_вих (Cs=1.9, K=2.2, Zn=4.3)', min: 1.8, max: 4.5, step: 0.1, unit: 'еВ' },
          { key: 'intensityFlux', label: 'Інтенсивність світлового потоку Φ', min: 0.5, max: 3.0, step: 0.25, unit: 'Вт/м²' },
          { key: 'retardingVolt', label: 'Затримуюча напруга на аноді U_гальм', min: 0.0, max: 2.5, step: 0.1, unit: 'В' }
        ]
      },

      rutherford: {
        secSym: '§ 34.',
        shortTitle: 'Дослід Резерфорда (розсіяння α-частинок)',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Хвильова і геометрична оптика · Рух світлового фронту',
        badge: 'Планетарний атом',
        subtitle: 'Гіперболічні траєкторії α-частинок у кулонівському полі важкого атомного ядра +Ze та прицільний параметр b',
        secTag: 'Параграф § 34 — Атомна і ядерна фізика · Дослід Резерфорда та формула кулонівського розсіяння',
        title: 'Дослід Резерфорда: розсіяння α-частинок ядром',
        epigraph: 'Те, що окремі α-частинки відлітають майже назад від золотої фольги, вразило мене так, ніби 15-дюймовий снаряд відскочив від аркуша паперу.',
        figCaption: 'Рис. 34.1 — Розсіяння пучка α-частинок на кут θ при різних прицільних параметрах b поблизу ядра золота +Ze',
        ekLabel: 'Кінетична енергія α-частинки E_k',
        epLabel: 'Кулонівський бар’єр ядра U(r)',
        qLabel: 'Енергія віддачі важкого ядра',
        cameraPos: [0, 6.5, 14.5],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          \cot\frac{\theta}{2} &= \frac{4\pi\varepsilon_0 E_\alpha b}{2 Z e^2} = \frac{2 b}{r_{\min}}, \qquad r_{\min} = \frac{1}{4\pi\varepsilon_0}\frac{2 Z e^2}{E_\alpha} \\
          \frac{d\sigma}{d\Omega} &= \left(\frac{2 Z e^2}{16\pi\varepsilon_0 E_\alpha}\right)^{\!2} \frac{1}{\sin^4(\theta/2)}
        \end{aligned}`,
        question: 'Як змінюється кут кулонівського розсіяння $\\theta$ додатньо зарядженої $\\alpha$-частинки при зменшенні прицільного параметра $b$ (відстані початкової лінії польоту від центра атомного ядра $+Ze$)?',
        options: [
          'Зі зменшенням прицільного параметра $b \\to 0$ кут розсіяння монотонно зростає до $\\theta \\to 180^\\circ$ (лобове відбиття назад на відстані найближчого зближення $r_{\\min}$)',
          'Кут розсіяння не залежить від прицільного параметра $b$',
          'При $b \\to 0$ частинка пролітає крізь центр ядра без відхилення ($\\theta = 0^\\circ$)'
        ],
        correctIndex: 0,
        explanation: 'Згідно з формулою Резерфорда $\\cot(\\theta/2) = 2b/r_{\\min}$, чим ближче траєкторія налітаючої $\\alpha$-частинки проходить до масивного додатного ядра (менший прицільний параметр $b$), тим сильніше кулонівське відштовхування $F \\propto 1/r^2$ викривлює її гіперболічну орбіту. При $b \\to 0$ маємо $\\cot(\\theta/2) \\to 0$, тобто $\\theta \\to 180^\\circ$.',
        formulaLatex: String.raw`\cot\frac{\theta}{2} = \frac{2 b}{r_{\min}}, \qquad r_{\min} = \frac{2 Z e^2}{4\pi\varepsilon_0 E_\alpha}, \qquad \theta = 2\arctan\!\left(\frac{r_{\min}}{2b}\right)`,
        liveLatexFn: p => {
          const rMinFm = (2 * p.nuclearZ * 1.44) / p.alphaEnergyMev;
          const thetaRad = 2 * Math.atan(rMinFm / (2 * Math.max(2, p.impactParamB)));
          const thetaDeg = thetaRad * (180 / Math.PI);
          return String.raw`r_{\min} = ${rMinFm.toFixed(1)}\text{ фм}, \quad b = ${p.impactParamB.toFixed(0)}\text{ фм} \;\Rightarrow\; \theta = ${thetaDeg.toFixed(1)}^\circ`;
        },
        defaults: { impactParamB: 18, alphaEnergyMev: 5.5, nuclearZ: 79, beamSpread: 1.0 },
        sliders: [
          { key: 'impactParamB', label: 'Прицільний параметр головної частинки b', min: 3, max: 60, step: 3, unit: 'фм' },
          { key: 'alphaEnergyMev', label: 'Енергія α-частинки E_α', min: 3.0, max: 9.0, step: 0.5, unit: 'МеВ' },
          { key: 'nuclearZ', label: 'Зарядове число ядра мішені Z (Au=79, Ag=47, Cu=29)', min: 20, max: 92, step: 1, unit: '' },
          { key: 'beamSpread', label: 'Густина пучка траєкторій', min: 0.5, max: 1.5, step: 0.25, unit: '' }
        ]
      },

      ampere: {
        secSym: '§ 35.',
        shortTitle: 'Закон Ампера: взаємодія паралельних струмів',
        category: 'electro',
        categoryGroupTitle: 'Розділ ІV. Електродинаміка та магнітне поле',
        badge: 'Сила Ампера',
        subtitle: 'Магнітна взаємодія двох паралельних провідників зі струмами I₁ та I₂ та еталон сили струму 1 Ампер',
        secTag: 'Параграф § 35 — Магнітне поле струму · Закон Ампера та взаємодія паралельних провідників',
        title: 'Взаємодія паралельних струмів та сила Ампера',
        epigraph: 'Два паралельні провідники притягуються, якщо струми в них течуть в одному напрямку, і відштовхуються, якщо струми протилежні.',
        figCaption: 'Рис. 35.1 — Магнітні лінії індукції B₁, B₂ та сили Ампера F₁₂, F₂₁ між двома паралельними шинами зі струмом',
        ekLabel: 'Енергія магнітного поля W_B',
        epLabel: 'Механічна робота пружних підвісів',
        qLabel: 'Джоулеве тепло в шинах Q',
        cameraPos: [0, 5.8, 13.8],
        cameraTarget: [0, 2.8, 0],
        referenceLatex: String.raw`\begin{aligned}
          B_1(d) &= \frac{\mu_0 I_1}{2\pi d}, \qquad \vec{F}_{12} = I_2 [\vec{l} \times \vec{B}_1] \\
          \frac{F}{l} &= \frac{\mu_0 I_1 I_2}{2\pi d}, \qquad \mu_0 = 4\pi\cdot 10^{-7}\text{ Н/А}^2
        \end{aligned}`,
        question: 'По двох довгих паралельних провідниках, розташованих на відстані $d$ один від одного, течуть струми $I_1$ та $I_2$ в одному напрямку. Як взаємодіють провідники і чому?',
        options: [
          'Провідники притягуються з силою $F/l = \\frac{\\mu_0 I_1 I_2}{2\\pi d}$ на одиницю довжини, бо за правилом свердлика та лівої руки сила Ампера $\\vec{F}_{12} = I_2[\\vec{l}\\times\\vec{B}_1]$ напрямлена до сусіднього провідника',
          'Провідники відштовхуються через однойменні заряди електронів',
          'Провідники обертаються один навколо одного без притягання чи відштовхування'
        ],
        correctIndex: 0,
        explanation: 'Провідник зі струмом $I_1$ створює на відстані $d$ магнітне поле з індукцією $B_1 = \\frac{\\mu_0 I_1}{2\\pi d}$, лінії якої охоплюють перший провідник за правилом правого гвинта. За правилом лівої руки сила Ампера $F_{12} = I_2 B_1 l$, що діє на співнапрямлений струм $I_2$, спрямована до першого провідника (притягання). При протилежних струмах сили змінюють знак на відштовхування.',
        formulaLatex: String.raw`\frac{F}{l} = \frac{\mu_0 I_1 I_2}{2\pi d}, \qquad B_1 = \frac{\mu_0 I_1}{2\pi d}`,
        liveLatexFn: p => {
          const bMicroT = (20 * Math.abs(p.current1)) / p.wireDistD;
          const fPerMeter = (0.02 * p.current1 * p.current2 * p.directionSign) / p.wireDistD;
          const modeText = p.directionSign > 0 ? String.raw`\text{притягання}` : String.raw`\text{відштовхування}`;
          return String.raw`B_1 = ${bMicroT.toFixed(1)}\text{ мкТл}, \quad \frac{|F|}{l} = ${Math.abs(fPerMeter).toFixed(2)}\text{ мН/м} \;\; (${modeText})`;
        },
        defaults: { current1: 15.0, current2: 15.0, wireDistD: 2.0, directionSign: 1 },
        sliders: [
          { key: 'current1', label: 'Сила струму в лівому провіднику I₁', min: 5.0, max: 30.0, step: 2.5, unit: 'А' },
          { key: 'current2', label: 'Сила струму в правому провіднику I₂', min: 5.0, max: 30.0, step: 2.5, unit: 'А' },
          { key: 'wireDistD', label: 'Відстань між провідниками d', min: 1.2, max: 3.4, step: 0.2, unit: 'см' },
          { key: 'directionSign', label: 'Напрямок струмів (+1 = однакові, -1 = зустрічні)', min: -1, max: 1, step: 2, unit: '' }
        ]
      },

      hall: {
        secSym: '§ 36.',
        shortTitle: 'Ефект Холла в провідниках і напівпровідниках',
        category: 'electro',
        categoryGroupTitle: 'Розділ ІV. Електродинаміка та магнітне поле',
        badge: 'Ефект Холла',
        subtitle: 'Виникнення поперечної різниці потенціалів U_H у пластинці зі струмом, вміщеній у перпендикулярне магнітне поле B',
        secTag: 'Параграф § 36 — Магнітне поле в речовині · Ефект Холла та визначення концентрації носіїв заряду',
        title: 'Ефект Холла та поперечна ЕРС у магнітному полі',
        epigraph: 'Ефект Холла не лише вимірює магнітну індукцію B, а й безпосередньо виявляє знак і концентрацію вільних носіїв заряду.',
        figCaption: 'Рис. 36.1 — Відхилення дрейфового потоку носіїв силою Лоренца до бічних граней пластинки та встановлення поля Холла E_H',
        ekLabel: 'Енергія поперечного поля Холла W_H',
        epLabel: 'Кінетична енергія дрейфу носіїв',
        qLabel: 'Омічні втрати в пластинці Q',
        cameraPos: [0, 6.2, 13.8],
        cameraTarget: [0, 2.3, 0],
        referenceLatex: String.raw`\begin{aligned}
          |q| E_H &= |q| v_d B \;\Rightarrow\; E_H = v_d B, \qquad I = n |q| v_d b d \\
          U_H &= E_H b = \frac{I B}{n |q| d} = R_H \frac{I B}{d}, \qquad R_H = \frac{1}{n q}
        \end{aligned}`,
        question: 'Чому поперечна напруга Холла $U_H = \\frac{IB}{n|q|d}$ за однакових значень струму $I$, магнітної індукції $B$ та товщини пластинки $d$ у напівпровідниках на декілька порядків більша, ніж у металах?',
        options: [
          'Тому що в напівпровідниках концентрація вільних носіїв заряду $n$ на багато порядків менша, ніж у металах, а стала Холла $R_H = \\frac{1}{nq}$ обернено пропорційна $n$',
          'Тому що в напівпровідниках не діє сила Лоренца',
          'Тому що напруга Холла прямо пропорційна концентрації носіїв $n$'
        ],
        correctIndex: 0,
        explanation: 'При заданій силі струму $I = n|q|v_d S$ менша концентрація носіїв заряду $n$ у напівпровіднику означає значно більшу середню дрейфову швидкість $v_d = \\frac{I}{n|q|bd}$. Оскільки рівноважне поле Холла $E_H = v_d B$ компенсує силу Лоренца, то $U_H = E_H b = \\frac{IB}{n|q|d}$ є обернено пропорційною концентрації $n$.',
        formulaLatex: String.raw`U_H = R_H \frac{I B}{d} = \frac{I B}{n |q| d}, \qquad E_H = v_d B`,
        liveLatexFn: p => {
          const sign = p.carrierSign < 0 ? -1 : 1;
          const uHallMv = sign * (p.currentI * p.magFieldB * 10) / (p.carrierConcN * p.slabThickD);
          const eHall = Math.abs(uHallMv) / 2.5;
          const typeStr = p.carrierSign < 0 ? 'n\\text{-тип (електрони)}' : 'p\\text{-тип (дірки)}';
          return String.raw`U_H = ${uHallMv >= 0 ? '+' : ''}${uHallMv.toFixed(1)}\text{ мВ}, \quad E_H = ${eHall.toFixed(1)}\text{ В/м} \quad (${typeStr})`;
        },
        defaults: { currentI: 3.0, magFieldB: 1.5, carrierConcN: 2.0, slabThickD: 1.0, carrierSign: -1 },
        sliders: [
          { key: 'currentI', label: 'Поздовжній струм через датчик I', min: 1.0, max: 6.0, step: 0.5, unit: 'А' },
          { key: 'magFieldB', label: 'Магнітна індукція поля B', min: 0.5, max: 3.0, step: 0.25, unit: 'Тл' },
          { key: 'carrierConcN', label: 'Концентрація носіїв n (відносна)', min: 0.8, max: 5.0, step: 0.2, unit: '×10²² м⁻³' },
          { key: 'slabThickD', label: 'Товщина пластинки d', min: 0.5, max: 2.5, step: 0.25, unit: 'мм' },
          { key: 'carrierSign', label: 'Знак носіїв (-1 = електрони, +1 = дірки)', min: -1, max: 1, step: 2, unit: '' }
        ]
      },

      coupled: {
        secSym: '§ 37.',
        shortTitle: 'Зв’язані маятники та нормальні моди (биття)',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та закони збереження',
        badge: 'Нормальні моди',
        subtitle: 'Періодичне перетікання механічної енергії між двома маятниками, з’єднаними пружною пружиною',
        secTag: 'Параграф § 37 — Теорія малих коливань · Нормальні частоти ω₁, ω₂ та явище биття',
        title: 'Зв’язані маятники: нормальні моди та явище биття',
        epigraph: 'Будь-який рух лінійної зв’язаної системи є суперпозицією її фундаментальних нормальних мод.',
        figCaption: 'Рис. 37.1 — Перефазування коливань двох маятників та повний обмін енергією з періодом биття T_б = 2π/(ω₂ − ω₁)',
        ekLabel: 'Енергія маятника 1 E₁',
        epLabel: 'Енергія маятника 2 E₂',
        qLabel: 'Енергія пружини зв’язку U_зв',
        cameraPos: [0, 6.2, 14.5],
        cameraTarget: [0, 3.0, 0],
        referenceLatex: String.raw`\begin{aligned}
          \omega_1 &= \sqrt{\frac{g}{L}}, \qquad \omega_2 = \sqrt{\frac{g}{L} + \frac{2\kappa}{m}} \\
          \Omega_{\text{б}} &= \omega_2 - \omega_1, \qquad T_{\text{б}} = \frac{2\pi}{\omega_2 - \omega_1}
        \end{aligned}`,
        question: 'Як зміниться період повного перетікання енергії між маятниками (період биття $T_{\\text{б}} = \\frac{2\\pi}{\\omega_2 - \\omega_1}$), якщо збільшити жорсткість з’єднувальної пружини $\\kappa$?',
        options: [
          'Період биття $T_{\\text{б}}$ зменшиться: сильніший пружний зв’язок збільшує розщеплення нормальних частот $\\omega_2 - \\omega_1$, тому обмін енергією відбувається швидше',
          'Період биття $T_{\\text{б}}$ зросте пропорційно жорсткості $\\kappa$',
          'Частота обміну енергією залежить лише від довжини ниток $L$ і не залежить від пружини'
        ],
        correctIndex: 0,
        explanation: 'Синфазна мода коливається з частотою $\\omega_1 = \\sqrt{g/L}$ (пружина не деформується), а протифазна — з частотою $\\omega_2 = \\sqrt{g/L + 2\\kappa/m}$. Збільшення жорсткості пружини $\\kappa$ збільшує різницю частот $\\Delta\\omega = \\omega_2 - \\omega_1$, тому період биття $T_{\\text{б}} = 2\\pi / \\Delta\\omega$ скорочується.',
        formulaLatex: String.raw`x_1(t) \propto \cos\!\left(\frac{\omega_2 - \omega_1}{2}t\right)\cos(\bar{\omega}t), \qquad \Delta\omega = \omega_2 - \omega_1`,
        liveLatexFn: p => {
          const w1 = Math.sqrt(9.81 / p.pendLength);
          const w2 = Math.sqrt(9.81 / p.pendLength + (2 * p.springK) / p.bobMass);
          const tBeat = (2 * Math.PI) / Math.max(0.05, w2 - w1);
          return String.raw`\omega_1 = ${w1.toFixed(2)}\text{ с}^{-1}, \quad \omega_2 = ${w2.toFixed(2)}\text{ с}^{-1}, \quad T_{\text{б}} = ${tBeat.toFixed(2)}\text{ с}`;
        },
        defaults: { pendLength: 2.6, springK: 1.8, bobMass: 1.5, initMode: 0 },
        sliders: [
          { key: 'pendLength', label: 'Довжина підвісу маятників L', min: 1.6, max: 3.6, step: 0.2, unit: 'м' },
          { key: 'springK', label: 'Жорсткість пружини зв’язку κ', min: 0.4, max: 5.0, step: 0.2, unit: 'Н/м' },
          { key: 'bobMass', label: 'Маса кожного тягарця m', min: 0.8, max: 3.0, step: 0.2, unit: 'кг' },
          { key: 'initMode', label: 'Режим (0 = биття, 1 = синфазна, -1 = протифазна)', min: -1, max: 1, step: 1, unit: '' }
        ]
      },

      precession: {
        secSym: '§ 38.',
        shortTitle: 'Гіроскопічна прецесія дзиґи під дією моменту сили',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та закони збереження',
        badge: 'Гіроскоп',
        subtitle: 'Прецесія вектора власного моменту імпульсу L навколо вертикалі під дією моменту сили тяжіння M = [r × mg]',
        secTag: 'Параграф § 38 — Динаміка твердого тіла · Основне рівняння гіроскопа dL/dt = M та кутова швидкість прецесії Ω',
        title: 'Гіроскопічна прецесія важкої симетричної дзиґи',
        epigraph: 'Вісь швидкого гіроскопа рухається не туди, куди її штовхає сила, а в напрямку вектора моменту цієї сили.',
        figCaption: 'Рис. 38.1 — Ортогональність моменту сили тяжіння M = [r × mg] до власного моменту імпульсу L та конус прецесії',
        ekLabel: 'Енергія власного обертання E_ω',
        epLabel: 'Енергія прецесії E_Ω',
        qLabel: 'Потенціальна енергія нахилу U_g',
        cameraPos: [0, 6.5, 13.5],
        cameraTarget: [0, 2.4, 0],
        referenceLatex: String.raw`\begin{aligned}
          \frac{d\vec{L}}{dt} &= \vec{M} = [\vec{r} \times m\vec{g}], \qquad L = I\omega \\
          \Omega_{\text{прец}} &= \frac{m g d}{I \omega} = \frac{M}{L \sin\theta}
        \end{aligned}`,
        question: 'Як зміниться кутова швидкість прецесії гіроскопа $\\Omega_{\\text{прец}} = \\frac{mgd}{I\\omega}$, якщо розкрутити маховик до вдвічі більшої власної кутової швидкості $\\omega$?',
        options: [
          'Кутова швидкість прецесії $\\Omega_{\\text{прец}}$ зменшиться вдвічі: більший власний момент імпульсу $L = I\\omega$ робить вісь гіроскопа стійкішою до зовнішнього моменту сили',
          'Кутова швидкість прецесії $\\Omega_{\\text{прец}}$ зросте вдвічі',
          'Швидкість прецесії не залежить від швидкості обертання маховика $\\omega$'
        ],
        correctIndex: 0,
        explanation: 'З рівняння моментів $dL = L\\sin\\theta\\,\\Omega_{\\text{прец}}\\,dt = mgd\\sin\\theta\\,dt$ випливає формула $\\Omega_{\\text{прец}} = \\frac{mgd}{I\\omega}$. Отже, чим більший власний момент імпульсу $L = I\\omega$, тим повільніше прецесує вісь ротора.',
        formulaLatex: String.raw`\Omega_{\text{прец}} = \frac{m g d}{I \omega}, \qquad L = I \omega, \qquad M = m g d \sin\theta`,
        liveLatexFn: p => {
          const iSpin = 0.5 * p.rotorMass * 1.15 * 1.15;
          const lSpin = iSpin * p.spinOmega;
          const omegaPrec = (p.rotorMass * 9.81 * p.pivotArmD) / Math.max(0.5, lSpin);
          return String.raw`L = ${lSpin.toFixed(1)}\text{ кг·м}^2/\text{с}, \quad \Omega_{\text{прец}} = ${omegaPrec.toFixed(2)}\text{ рад/с}`;
        },
        defaults: { spinOmega: 35, rotorMass: 2.0, pivotArmD: 1.2, tiltDeg: 32 },
        sliders: [
          { key: 'spinOmega', label: 'Власна кутова швидкість ротора ω', min: 15, max: 70, step: 5, unit: 'рад/с' },
          { key: 'rotorMass', label: 'Маса маховика гіроскопа m', min: 1.0, max: 3.5, step: 0.25, unit: 'кг' },
          { key: 'pivotArmD', label: 'Плече центру мас відносно опори d', min: 0.6, max: 2.0, step: 0.1, unit: 'м' },
          { key: 'tiltDeg', label: 'Кут нутації (нахилу осі) θ', min: 15, max: 55, step: 5, unit: '°' }
        ]
      },

      magnus: {
        secSym: '§ 39.',
        shortTitle: 'Ефект Магнуса — підіймальна сила обертового тіла',
        category: 'mechanics',
        categoryGroupTitle: 'Розділ І. Класична механіка та закони збереження',
        badge: 'Аеродинаміка',
        subtitle: 'Виникнення поперечної підіймальної сили F_M при обтіканні обертового циліндра потоком внаслідок циркуляції швидкості Γ',
        secTag: 'Параграф § 39 — Механіка суцільних середовищ · Теорема Жуковського F_M = ρ v_∞ Γ та ефект Магнуса',
        title: 'Ефект Магнуса та підіймальна сила обертового циліндра',
        epigraph: 'Обертання тіла захоплює примежовий шар повітря, створюючи асиметрію швидкостей і поперечний градієнт тиску Бернуллі.',
        figCaption: 'Рис. 39.1 — Деформація ліній течії навколо ротора Флеттнера та виникнення поперечної сили Магнуса F_M',
        ekLabel: 'Кінетична енергія потоку E_пот',
        epLabel: 'Енергія обертання ротора E_об',
        qLabel: 'Робота поперечної сили Магнуса',
        cameraPos: [0, 6.2, 14.0],
        cameraTarget: [0, 2.5, 0],
        referenceLatex: String.raw`\begin{aligned}
          \Gamma &= 2\pi R^2 \omega, \qquad \Delta P = \frac{1}{2}\rho\left(v_{\text{верх}}^2 - v_{\text{низ}}^2\right) \\
          F_M &= \rho v_\infty \Gamma L = 2\pi \rho R^2 L \omega v_\infty
        \end{aligned}`,
        question: 'Куди напрямлена поперечна сила Магнуса $\\vec{F}_M$, якщо потік повітря набігає зліва направо ($+X$), а горизонтальний циліндр обертається так, що його верхня поверхня рухається за потоком?',
        options: [
          'Вертикально вгору ($+Y$): над циліндром швидкість потоку додається до лінійної швидкості поверхні ($v_{\\text{верх}} > v_{\\text{низ}}$), тому за законом Бернуллі тиск зверху менший, ніж знизу',
          'Вертикально вниз ($-Y$), оскільки зверху тиск повітря зростає',
          'Сила Магнуса діє лише вздовж потоку і не створює підіймальної складової'
        ],
        correctIndex: 0,
        explanation: 'Там, де поверхня обертового циліндра рухається попутно з набігаючим потоком, результуюча швидкість течії більша ($v + \\omega R$), а статичний тиск за рівнянням Бернуллі $P + \\frac{1}{2}\\rho v^2 = \\text{const}$ — менший. Різниця тисків створює поперечну підіймальну силу Жуковського–Магнуса $F_M = \\rho v_\\infty \\Gamma L$.',
        formulaLatex: String.raw`F_M = \rho v_\infty \Gamma L = 2\pi \rho R^2 L \omega v_\infty, \qquad \Gamma = 2\pi R^2 \omega`,
        liveLatexFn: p => {
          const gamma = 2 * Math.PI * (p.cylRadius * 0.1) * (p.cylRadius * 0.1) * p.spinOmega;
          const fMagnus = p.airDensity * p.flowSpeed * gamma * 2.5;
          return String.raw`\Gamma = ${gamma.toFixed(2)}\text{ м}^2/\text{с}, \qquad F_M = ${fMagnus.toFixed(2)}\text{ Н}`;
        },
        defaults: { flowSpeed: 8.0, spinOmega: 25.0, cylRadius: 1.2, airDensity: 1.25 },
        sliders: [
          { key: 'flowSpeed', label: 'Швидкість набігаючого потоку v_∞', min: 3.0, max: 15.0, step: 1.0, unit: 'м/с' },
          { key: 'spinOmega', label: 'Кутова швидкість циліндра ω', min: -40.0, max: 40.0, step: 5.0, unit: 'рад/с' },
          { key: 'cylRadius', label: 'Радіус ротора R', min: 0.8, max: 1.8, step: 0.1, unit: 'дм' },
          { key: 'airDensity', label: 'Густина середовища ρ', min: 0.6, max: 2.4, step: 0.2, unit: 'кг/м³' }
        ]
      },

      capillary: {
        secSym: '§ 40.',
        shortTitle: 'Поверхневий натяг і капілярне підняття (формула Жюрена)',
        category: 'thermo',
        categoryGroupTitle: 'Розділ ІІ. Молекулярна фізика, гідродинаміка і термодинаміка',
        badge: 'Капілярність',
        subtitle: 'Додатковий лапласівський тиск ΔP = 2σ cos θ / r під увігнутим або опуклим меніском та рівноважна висота стовпчика h',
        secTag: 'Параграф § 40 — Молекулярна фізика рідин · Формула Лапласа та закон капілярного підняття Жюрена',
        title: 'Поверхневий натяг, меніск та капілярні явища',
        epigraph: 'Тонка капілярна трубка унаочнює молекулярні сили зчеплення, здатні піднімати рідину всупереч тяжінню.',
        figCaption: 'Рис. 40.1 — Порівняння рівня рідини у капілярній трубці радіуса r з широкою посудиною за різних кутів змочування θ',
        ekLabel: 'Поверхнева енергія меніска W_σ',
        epLabel: 'Потенціальна енергія стовпчика U_g',
        qLabel: 'Робота сил змочування A_зм',
        cameraPos: [0, 6.2, 13.8],
        cameraTarget: [0, 2.8, 0],
        referenceLatex: String.raw`\begin{aligned}
          \Delta P_{\text{Лапл}} &= \frac{2\sigma \cos\theta}{r} = \rho g h \\
          h &= \frac{2\sigma \cos\theta}{\rho g r}
        \end{aligned}`,
        question: 'Що відбувається з рівнем рідини у вузькому скляному капілярі, якщо рідина не змочує стінки трубки (крайовий кут $\\theta > 90^\\circ$, наприклад, ртуть на склі)?',
        options: [
          'Утворюється опуклий меніск, лапласівський тиск напрямлений вниз ($\\cos\\theta < 0$), і рівень рідини в капілярі опускається нижче рівня в широкій посудині ($h < 0$)',
          'Рідина піднімається ще вище, ніж за повного змочування',
          'Рівень у капілярі залишається точно таким самим, як у широкій посудині'
        ],
        correctIndex: 0,
        explanation: 'За формулою Жюрена $h = \\frac{2\\sigma\\cos\\theta}{\\rho g r}$ знак висоти визначається косинусом крайового кута $\\theta$. При змочуванні ($\\theta < 90^\\circ$, $\\cos\\theta > 0$) увігнутий меніск тягне стовпчик угору ($h > 0$), а при незмочуванні ($\\theta > 90^\\circ$, $\\cos\\theta < 0$) опуклий меніск виштовхує рідину вниз ($h < 0$).',
        formulaLatex: String.raw`h = \frac{2\sigma \cos\theta}{\rho g r}, \qquad \Delta P = \frac{2\sigma \cos\theta}{r}`,
        liveLatexFn: p => {
          const cosTheta = Math.cos((p.contactAngle * Math.PI) / 180);
          const hMm = (2 * p.sigmaMilli * cosTheta) / (p.fluidRho * 9.81 * p.tubeRadiusMm * 0.001) * 0.001;
          const dP = (2 * p.sigmaMilli * 0.001 * cosTheta) / (p.tubeRadiusMm * 0.001);
          return String.raw`h = ${hMm.toFixed(1)}\text{ мм}, \qquad \Delta P = ${dP.toFixed(0)}\text{ Па} \quad (\theta = ${p.contactAngle}^\circ)`;
        },
        defaults: { sigmaMilli: 72.8, contactAngle: 20, tubeRadiusMm: 0.6, fluidRho: 1.0 },
        sliders: [
          { key: 'sigmaMilli', label: 'Коефіцієнт поверхневого натягу σ', min: 25.0, max: 120.0, step: 2.5, unit: 'мН/м' },
          { key: 'contactAngle', label: 'Крайовий кут змочування θ', min: 0, max: 140, step: 10, unit: '°' },
          { key: 'tubeRadiusMm', label: 'Внутрішній радіус капіляра r', min: 0.3, max: 1.5, step: 0.1, unit: 'мм' },
          { key: 'fluidRho', label: 'Густина рідини ρ', min: 0.7, max: 2.5, step: 0.1, unit: 'г/см³' }
        ]
      },

      brownian: {
        secSym: '§ 41.',
        shortTitle: 'Броунівський рух і формула Ейнштейна–Смолуховського',
        category: 'thermo',
        categoryGroupTitle: 'Розділ ІІ. Молекулярна фізика, гідродинаміка і термодинаміка',
        badge: 'Статистична фізика',
        subtitle: 'Хаотична траєкторія завислої мікрочастинки під ударами молекул рідини та лінійне зростання середнього квадрата зміщення ⟨r²⟩ = 6Dt',
        secTag: 'Параграф § 41 — Молекулярно-кінетична теорія · Закон диффузії Ейнштейна–Смолуховського ⟨r²⟩ = 6 D t',
        title: 'Броунівський рух та дифузія Ейнштейна–Смолуховського',
        epigraph: 'Видиме тремтіння броунівської зернини є прямим макроскопічним доказом теплового руху невидимих молекул.',
        figCaption: 'Рис. 41.1 — Ламана траєкторія випадкового блукання броунівської частинки в тепловій ванні молекул',
        ekLabel: 'Середня теплова енергія 3/2 kT',
        epLabel: 'Дифузійний коефіцієнт D (відн.)',
        qLabel: 'В’язке розсіювання Стокса',
        cameraPos: [0, 7.2, 13.5],
        cameraTarget: [0, 2.3, 0],
        referenceLatex: String.raw`\begin{aligned}
          D &= \frac{k_B T}{6\pi \eta a}, \qquad \langle E_k \rangle = \frac{3}{2} k_B T \\
          \langle r^2(t) \rangle &= 6 D t = \frac{k_B T}{\pi \eta a}\, t
        \end{aligned}`,
        question: 'Як залежить середньоквадратичне віддалення броунівської частинки від початкової точки $\\sqrt{\\langle r^2 \\rangle}$ від часу спостереження $t$ та в’язкості середовища $\\eta$?',
        options: [
          'Пропорційне кореню квадратному з часу $\\sqrt{t}$ та обернено пропорційне $\\sqrt{\\eta}$, оскільки $\\langle r^2 \\rangle = 6Dt = \\frac{k_B T}{\\pi \\eta a}t$',
          'Зростає лінійно з часом $t$, як при рівномірному прямолінійному русі',
          'Залишається сталим і рівним нулю в будь-який момент часу'
        ],
        correctIndex: 0,
        explanation: 'Оскільки удари молекул з різних боків статистично незалежні, додаються не самі зміщення, а їхні квадрати (дисперсії): $\\langle r^2 \\rangle = 6Dt$, де коефіцієнт дифузії Ейнштейна $D = \\frac{k_B T}{6\\pi\\eta a}$ зростає з температурою $T$ і спадає при збільшенні радіуса частинки $a$ та в’язкості $\\eta$.',
        formulaLatex: String.raw`\langle r^2 \rangle = 6 D t, \qquad D = \frac{k_B T}{6\pi \eta a}`,
        liveLatexFn: p => {
          const dVal = (1.38 * p.tempK) / (6 * Math.PI * p.viscosityEta * p.grainRadiusUm * 100);
          const rmsUm = Math.sqrt(6 * dVal * Math.max(0.2, uiState.simTime));
          return String.raw`D = ${dVal.toFixed(2)}\text{ мкм}^2/\text{с}, \qquad \sqrt{\langle r^2 \rangle} = ${rmsUm.toFixed(2)}\text{ мкм}`;
        },
        defaults: { tempK: 310, grainRadiusUm: 1.0, viscosityEta: 1.0 },
        sliders: [
          { key: 'tempK', label: 'Абсолютна температура рідини T', min: 250, max: 450, step: 10, unit: 'К' },
          { key: 'grainRadiusUm', label: 'Радіус броунівської частинки a', min: 0.5, max: 2.5, step: 0.25, unit: 'мкм' },
          { key: 'viscosityEta', label: 'Динамічна в’язкість середовища η', min: 0.5, max: 3.0, step: 0.25, unit: 'мПа·с' }
        ]
      },

      michelson: {
        secSym: '§ 42.',
        shortTitle: 'Інтерферометр Майкельсона — прецизійна інтерференція',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Оптика, світловий фронт та квантова фізика',
        badge: 'Інтерферометрія',
        subtitle: 'Поділ когерентного лазерного пучка напівпрозорим дзеркалом на два ортогональні плеча L₁, L₂ та зміщення кілець при зсуві Δd',
        secTag: 'Параграф § 42 — Хвильова оптика · Інтерферометр Майкельсона та оптична різниця ходу Δ = 2 Δd',
        title: 'Інтерферометр Майкельсона та фазовий зсув променів',
        epigraph: 'Зміщення дзеркала лише на пів довжини світлової хвилі змінює освітленість у центрі інтерференційної картини на протилежну.',
        figCaption: 'Рис. 42.1 — Оптична схема інтерферометра Майкельсона з світлоподілювачем BS, дзеркалами M₁, M₂ та концентричними кільцями',
        ekLabel: 'Інтенсивність у центрі I_0',
        epLabel: 'Інтенсивність опорного плеча I₁',
        qLabel: 'Частка гасіння в мінімумах',
        cameraPos: [0, 8.8, 13.5],
        cameraTarget: [0, 1.8, 0],
        referenceLatex: String.raw`\begin{aligned}
          \Delta &= 2\,\Delta d, \qquad \Delta\varphi = \frac{2\pi}{\lambda}(2\,\Delta d) \\
          I(\Delta d) &= 4 I_0 \cos^2\!\left(\frac{2\pi\,\Delta d}{\lambda}\right), \qquad \Delta m = \frac{2\,\Delta d}{\lambda}
        \end{aligned}`,
        question: 'На яку відстань $\\Delta d$ потрібно перемістити рухоме дзеркало інтерферометра Майкельсона $M_1$, щоб інтерференційна картина на екрані змістилася рівно на одну повну смугу ($\\Delta m = 1$)?',
        options: [
          'На половину довжини хвилі $\\Delta d = \\lambda / 2$, оскільки промінь проходить змінюване плече двічі (туди й назад), і різниця ходу становить $\\Delta = 2\\Delta d = \\lambda$',
          'На цілу довжину хвилі $\\Delta d = \\lambda$',
          'На дві довжини хвилі $\\Delta d = 2\\lambda$'
        ],
        correctIndex: 0,
        explanation: 'У плечі з рухомим дзеркалом $M_1$ світловий промінь проходить відстань від світлоподілювача до дзеркала і назад. Тому переміщення дзеркала на $\\Delta d$ змінює оптичну різницю ходу на $\\Delta = 2\\Delta d$. Умова переходу до наступного максимуму $2\\Delta d = \\lambda$ дає $\\Delta d = \\lambda/2$.',
        formulaLatex: String.raw`\Delta = 2\,\Delta d = m\lambda, \qquad I = I_{\max}\cos^2\!\left(\frac{2\pi\,\Delta d}{\lambda}\right)`,
        liveLatexFn: p => {
          const deltaNm = 2 * p.mirrorShiftNm;
          const mShift = deltaNm / p.wavelengthNm;
          const iRel = Math.pow(Math.cos((Math.PI * deltaNm) / p.wavelengthNm), 2);
          return String.raw`\Delta = 2\Delta d = ${deltaNm.toFixed(0)}\text{ нм}, \quad \Delta m = ${mShift.toFixed(2)}, \quad I/I_{\max} = ${iRel.toFixed(2)}`;
        },
        defaults: { wavelengthNm: 550, mirrorShiftNm: 0, beamPowerMw: 5.0 },
        sliders: [
          { key: 'wavelengthNm', label: 'Довжина хвилі лазера λ', min: 420, max: 680, step: 10, unit: 'нм' },
          { key: 'mirrorShiftNm', label: 'Мікрометричний зсув дзеркала Δd', min: 0, max: 700, step: 25, unit: 'нм' },
          { key: 'beamPowerMw', label: 'Потужність лазерного пучка P₀', min: 2.0, max: 10.0, step: 1.0, unit: 'мВт' }
        ]
      },

      compton: {
        secSym: '§ 43.',
        shortTitle: 'Ефект Комптона — розсіяння фотонів на електронах',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Оптика, світловий фронт та квантова фізика',
        badge: 'Квантова оптика',
        subtitle: 'Пружне зіткнення рентгенівського фотона з вільним електроном, збільшення довжини хвилі Δλ = λ_C (1 − cos θ) та імпульс віддачі',
        secTag: 'Параграф § 43 — Корпускулярні властивості світла · Формула Комптона Δλ = (h / m_e c)(1 − cos θ)',
        title: 'Ефект Комптона та релятивістський імпульс фотона',
        epigraph: 'Розсіяння рентгенівських квантів за законами більярдних куль довело, що фотон несе не лише енергію hν, а й імпульс h/λ.',
        figCaption: 'Рис. 43.1 — Розліт розсіяного фотона λ′ під кутом θ та електрона віддачі під кутом φ із збереженням енергії та імпульсу',
        ekLabel: 'Енергія розсіяного фотона E_γ′',
        epLabel: 'Кінетична енергія електрона віддачі K_e',
        qLabel: 'Комптонівський зсув Δλ (відн.)',
        cameraPos: [0, 7.2, 13.8],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          \vec{p}_\gamma &= \vec{p}_{\gamma}' + \vec{p}_e, \qquad h\nu + m_e c^2 = h\nu' + E_e \\
          \Delta\lambda &= \lambda' - \lambda_0 = \lambda_C (1 - \cos\theta), \qquad \lambda_C = \frac{h}{m_e c} \approx 2.43\text{ пм}
        \end{aligned}`,
        question: 'При якому куті розсіяння $\\theta$ комптонівське збільшення довжини хвилі фотона $\\Delta\\lambda = \\lambda_C(1 - \\cos\\theta)$ є максимальним і чому воно дорівнює?',
        options: [
          'При зворотному розсіянні на кут $\\theta = 180^\\circ$ ($\\cos 180^\\circ = -1$): зсув максимальний і дорівнює подвоєній комптонівській довжині хвилі $\\Delta\\lambda_{\\max} = 2\\lambda_C \\approx 4.85\\text{ пм}$',
          'При розсіянні вперед під кутом $\\theta = 0^\\circ$',
          'Зсув довжини хвилі $\\Delta\\lambda$ не залежить від кута розсіяння $\\theta$'
        ],
        correctIndex: 0,
        explanation: 'Оскільки $\\Delta\\lambda = \\lambda_C(1 - \\cos\\theta)$, де $\\lambda_C = \\frac{h}{m_e c} = 2.426\\text{ пм}$, функція $1 - \\cos\\theta$ набуває найбільшого значення $2$ при лобовому відбитті фотона назад ($\\theta = 180^\\circ$). При цьому електрон отримує максимальну кінетичну енергію віддачі.',
        formulaLatex: String.raw`\Delta\lambda = \lambda' - \lambda_0 = \lambda_C (1 - \cos\theta), \qquad \lambda_C = 2.426\text{ пм}`,
        liveLatexFn: p => {
          const lambdaC = 2.426;
          const dLambda = lambdaC * (1 - Math.cos((p.scatterAngleDeg * Math.PI) / 180));
          const lambdaPrime = p.lambda0Pm + dLambda;
          return String.raw`\Delta\lambda = ${dLambda.toFixed(2)}\text{ пм}, \quad \lambda' = ${lambdaPrime.toFixed(2)}\text{ пм} \quad (\theta = ${p.scatterAngleDeg}^\circ)`;
        },
        defaults: { lambda0Pm: 5.0, scatterAngleDeg: 90, beamRate: 1.4 },
        sliders: [
          { key: 'lambda0Pm', label: 'Початкова довжина хвилі рентгену λ₀', min: 2.0, max: 12.0, step: 0.5, unit: 'пм' },
          { key: 'scatterAngleDeg', label: 'Кут розсіяння фотона θ', min: 15, max: 180, step: 15, unit: '°' },
          { key: 'beamRate', label: 'Частота зіткнень у мішені', min: 0.8, max: 2.4, step: 0.2, unit: 'Гц' }
        ]
      },

      bohr: {
        secSym: '§ 44.',
        shortTitle: 'Постулати Бора та квантові орбіти атома водню',
        category: 'optics',
        categoryGroupTitle: 'Розділ ІІІ. Оптика, світловий фронт та квантова фізика',
        badge: 'Атомна фізика',
        subtitle: 'Квантування моменту імпульсу L_n = nℏ, стоячі хвилі де Бройля 2πr_n = nλ_дБ та випромінювання спектральних ліній Рідберга',
        secTag: 'Параграф § 44 — Квантова фізика атома · Стаціонарні орбіти Бора r_n = n² a₀ та формула Бальмера–Рідберга',
        title: 'Модель атома Бора, хвилі де Бройля та спектральні серії',
        epigraph: 'На дозволеній орбіті Бора вкладається ціле число довжин хвиль де Бройля електрона, тому стояча хвиля не випромінює.',
        figCaption: 'Рис. 44.1 — Дозволені борівські орбіти n = 1..4 із укладеними стоячими хвилями де Бройля та випромінюванням фотона hν при переході',
        ekLabel: 'Кінетична енергія на орбіті K_n',
        epLabel: 'Модуль енергії зв’язку |E_n|',
        qLabel: 'Енергія кванта переходу ΔE = hν',
        cameraPos: [0, 8.6, 13.5],
        cameraTarget: [0, 2.2, 0],
        referenceLatex: String.raw`\begin{aligned}
          m_e v_n r_n &= n\hbar \;\Longleftrightarrow\; 2\pi r_n = n\lambda_{\text{дБ}}, \qquad E_n = -\frac{13.6\text{ еВ}}{n^2} \\
          h\nu &= E_{n_i} - E_{n_f} = 13.6\text{ еВ}\left(\frac{1}{n_f^2} - \frac{1}{n_i^2}\right)
        \end{aligned}`,
        question: 'Чому за гіпотезою де Бройля електрон може перебувати лише на дискретних борівських орбітах з радіусами $r_n = n^2 a_0$, де момент імпульсу $L_n = n\\hbar$?',
        options: [
          'Тому що вздовж колової орбіти має вкладатися ціле число $n$ довжин хвиль де Бройля ($2\\pi r_n = n \\frac{h}{p_n}$), інакше хвиля гасить сама себе внаслідок інтерференції',
          'Тому що кулонівська сила діє лише на цілих відстанях від ядра',
          'Тому що швидкість електрона на всіх орбітах однакова'
        ],
        correctIndex: 0,
        explanation: 'Підставивши довжину хвилі де Бройля $\\lambda_{\\text{дБ}} = \\frac{h}{m_e v_n}$ в умову замкненої стоячої хвилі на колі $2\\pi r_n = n\\lambda_{\\text{дБ}}$, одразу отримуємо правило квантування Бора $m_e v_n r_n = n\\frac{h}{2\\pi} = n\\hbar$. При переході з вищого рівня $n_i$ на нижчий $n_f$ випромінюється фотон з енергією $h\\nu = E_{n_i} - E_{n_f}$.',
        formulaLatex: String.raw`2\pi r_n = n\lambda_{\text{дБ}}, \qquad E_n = -\frac{13.6\text{ еВ}}{n^2}, \qquad \Delta E = 13.6\left(\frac{1}{n_f^2} - \frac{1}{n_i^2}\right)\text{ еВ}`,
        liveLatexFn: p => {
          const ni = Math.max(p.levelFinal + 1, p.levelInit);
          const nf = p.levelFinal;
          const eInit = -13.6 / (ni * ni);
          const eFinal = -13.6 / (nf * nf);
          const dE = eInit - eFinal;
          const lambdaNm = 1240 / Math.max(0.1, dE);
          return String.raw`n_i = ${ni} \to n_f = ${nf}: \quad \Delta E = ${dE.toFixed(2)}\text{ еВ}, \quad \lambda = ${lambdaNm.toFixed(0)}\text{ нм}`;
        },
        defaults: { levelInit: 3, levelFinal: 2, deBroglieAmp: 0.25 },
        sliders: [
          { key: 'levelInit', label: 'Початковий квантовий рівень n_i', min: 2, max: 4, step: 1, unit: '' },
          { key: 'levelFinal', label: 'Кінцевий квантовий рівень n_f', min: 1, max: 3, step: 1, unit: '' },
          { key: 'deBroglieAmp', label: 'Амплітуда стоячої хвилі де Бройля', min: 0.1, max: 0.45, step: 0.05, unit: 'відн.' }
        ]
      },

      biot: {
        secSym: '§ 45.',
        shortTitle: 'Закон Біо–Савара–Лапласа та котушки Гельмгольца',
        category: 'electro',
        categoryGroupTitle: 'Розділ ІV. Електродинаміка та магнітне поле',
        badge: 'Магнітостатика',
        subtitle: 'Розрахунок магнітної індукції B(x) на осі колових витків зі струмом та створення високооднорідного поля між котушками Гельмгольца',
        secTag: 'Параграф § 45 — Магнітне поле струмів · Закон Біо–Савара–Лапласа та умова Гельмгольца d = R',
        title: 'Закон Біо–Савара–Лапласа та котушки Гельмгольца',
        epigraph: 'Дві співвісні котушки на відстані, рівній їхньому радіусу, перетворюють викривлене поле витка на ідеально однорідне плато.',
        figCaption: 'Рис. 45.1 — Силові лінії та профіль осьової магнітної індукції B(x) двох співвісних колових котушок зі струмом I',
        ekLabel: 'Магнітна енергія поля W_B',
        epLabel: 'Індукція в центрі B(0) (відн.)',
        qLabel: 'Неоднорідність поля в центрі ΔB',
        cameraPos: [0, 6.4, 14.2],
        cameraTarget: [0, 2.5, 0],
        referenceLatex: String.raw`\begin{aligned}
          d\vec{B} &= \frac{\mu_0 I}{4\pi}\frac{[d\vec{l} \times \vec{r}]}{r^3}, \qquad B_{\text{витка}}(x) = \frac{\mu_0 N I R^2}{2(R^2 + x^2)^{3/2}} \\
          B_{\text{Гельм}}(0) &= \left(\frac{4}{5}\right)^{3/2}\frac{\mu_0 N I}{R} \quad (\text{при } d = R)
        \end{aligned}`,
        question: 'При якій відстані $d$ між двома однаковими співвісними коловими котушками радіуса $R$ зі співнапрямленими струмами магнітне поле в середній області між ними стає максимально однорідним (умова Гельмгольца)?',
        options: [
          'Коли відстань між центрами котушок точно дорівнює їхньому радіусу ($d = R$): у цій точці друга похідна $\\frac{d^2 B_x}{dx^2}$ обертається на нуль',
          'Коли відстань між котушками набагато більша за їхній радіус ($d \\gg R$)',
          'Коли струми в котушках течуть у протилежних напрямках'
        ],
        correctIndex: 0,
        explanation: 'Для одного колового витка $B(x) = \\frac{\\mu_0 NIR^2}{2(R^2+x^2)^{3/2}}$ точка перегину графіка (де $\\frac{d^2B}{dx^2} = 0$) лежить на відстані $x = \\pm R/2$. Тому при розташуванні двох котушок на відстані $d = R$ кривина спадання поля однієї котушки в центрі точно компенсується другою.',
        formulaLatex: String.raw`B(x) = \frac{\mu_0 N I R^2}{2}\left[\frac{1}{\left(R^2 + (x - d/2)^2\right)^{3/2}} + \frac{1}{\left(R^2 + (x + d/2)^2\right)^{3/2}}\right]`,
        liveLatexFn: p => {
          const rM = p.coilRadius * 0.1;
          const dM = p.coilSepRatio * rM;
          const bCenterMt = (1.2566 * p.turnsN * p.currentI * rM * rM) / Math.pow(rM * rM + (dM * dM) / 4, 1.5);
          return String.raw`d / R = ${p.coilSepRatio.toFixed(2)}, \qquad B(0) = ${bCenterMt.toFixed(2)}\text{ мТл}`;
        },
        defaults: { currentI: 5.0, coilRadius: 1.8, coilSepRatio: 1.0, turnsN: 20 },
        sliders: [
          { key: 'currentI', label: 'Сила струму в обмотках I', min: 1.0, max: 10.0, step: 0.5, unit: 'А' },
          { key: 'coilRadius', label: 'Радіус котушок R', min: 1.2, max: 2.4, step: 0.2, unit: 'дм' },
          { key: 'coilSepRatio', label: 'Відношення відстані до радіуса d/R (1.0 = Гельмгольц)', min: 0.5, max: 2.0, step: 0.25, unit: '' },
          { key: 'turnsN', label: 'Кількість витків у кожній котушці N', min: 10, max: 40, step: 5, unit: '' }
        ]
      },

      transformer: {
        secSym: '§ 46.',
        shortTitle: 'Змінний струм і трансформатор на феромагнітному осерді',
        category: 'electro',
        categoryGroupTitle: 'Розділ ІV. Електродинаміка та магнітне поле',
        badge: 'Змінний струм',
        subtitle: 'Взаємна електромагнітна індукція через спільний змінний магнітний потік Φ(t) в осерді та коефіцієнт трансформації U₂/U₁ = N₂/N₁',
        secTag: 'Параграф § 46 — Квазістаціонарні змінні струми · Закон Фарадея в трансформаторі U₂ / U₁ = N₂ / N₁',
        title: 'Трансформатор змінного струму та взаємна індукція',
        epigraph: 'Змінне магнітне поле замкненого осердя безконтактно передає електричну потужність із одного контуру в інший, масштабуючи напругу.',
        figCaption: 'Рис. 46.1 — Замкнене феромагнітне осердя зі змінним потоком Φ(t), первинною обмоткою N₁ та вторинною обмоткою N₂',
        ekLabel: 'Миттєва потужність вторинної P₂',
        epLabel: 'Енергія магнітного потоку осердя W_Φ',
        qLabel: 'Втрати на вихрові струми та гістерезис',
        cameraPos: [0, 6.6, 13.8],
        cameraTarget: [0, 2.4, 0],
        referenceLatex: String.raw`\begin{aligned}
          \mathcal{E}_1 &= -N_1\frac{d\Phi}{dt}, \qquad \mathcal{E}_2 = -N_2\frac{d\Phi}{dt} \\
          \frac{U_2}{U_1} &= \frac{N_2}{N_1} = k, \qquad I_1 U_1 \approx I_2 U_2
        \end{aligned}`,
        question: 'Чому звичайний трансформатор не може підвищувати або знижувати постійну напругу від акумулятора ($\\omega = 0$), навіть якщо первинна обмотка має сотні витків?',
        options: [
          'Тому що ЕРС індукції у вторинній обмотці $\\mathcal{E}_2 = -N_2 \\frac{d\\Phi}{dt}$ виникає лише при зміні магнітного потоку в часі; постійний струм створює сталий потік ($\\frac{d\\Phi}{dt} = 0$), тому $U_2 = 0$',
          'Тому що феромагнітне осердя не проводить постійне магнітне поле',
          'Тому що при постійному струмі напруга $U_2$ завжди дорівнює $U_1$'
        ],
        correctIndex: 0,
        explanation: 'Робота трансформатора ґрунтується на законі електромагнітної індукції Фарадея: кожен виток охоплює спільний магнітний потік осердя $\\Phi(t) = \\Phi_0 \\sin(\\omega t)$, у якому наводиться ЕРС $e(t) = -\\frac{d\\Phi}{dt}$. Відношення діючих напруг дорівнює відношенню чисел витків $\\frac{U_2}{U_1} = \\frac{N_2}{N_1}$.',
        formulaLatex: String.raw`\frac{U_2}{U_1} = \frac{N_2}{N_1}, \qquad \mathcal{E}_2(t) = -N_2 \omega \Phi_0 \cos(\omega t)`,
        liveLatexFn: p => {
          const ratio = p.turnsN2 / p.turnsN1;
          const u2V = p.voltageU1 * ratio;
          const phiMaxMw = (p.voltageU1 * 10) / (4.44 * p.acFreqHz * p.turnsN1);
          const modeStr = ratio > 1.02 ? '\\text{підвищ.}' : (ratio < 0.98 ? '\\text{зниж.}' : '\\text{розділ.}');
          return String.raw`k = ${ratio.toFixed(2)} \;(${modeStr}), \quad U_2 = ${u2V.toFixed(1)}\text{ В}, \quad \Phi_0 = ${phiMaxMw.toFixed(2)}\text{ мВб}`;
        },
        defaults: { voltageU1: 110, turnsN1: 20, turnsN2: 40, acFreqHz: 2.0 },
        sliders: [
          { key: 'voltageU1', label: 'Діюча первинна напруга U₁', min: 50, max: 220, step: 10, unit: 'В' },
          { key: 'turnsN1', label: 'Число витків первинної обмотки N₁', min: 10, max: 50, step: 5, unit: '' },
          { key: 'turnsN2', label: 'Число витків вторинної обмотки N₂', min: 10, max: 80, step: 5, unit: '' },
          { key: 'acFreqHz', label: 'Частота змінного струму f (масштабована)', min: 1.0, max: 5.0, step: 0.5, unit: 'Гц' }
        ]
      }
    };

    const SCENE_KEYS = Object.keys(SCENE_CONFIGS);

    const sceneParams = {};
    for (const key of Object.keys(SCENE_CONFIGS)) {
      sceneParams[key] = { ...SCENE_CONFIGS[key].defaults };
    }

    let activeSim = null;

    // ============================================================================
    // 4. МОДУЛЬ § 1: ЗАКОН ЗБЕРЕЖЕННЯ ІМПУЛЬСУ
    // ============================================================================
    class CollisionSimulation {
      constructor() {
        this.arrows = [];
        this.particles = new EnergyParticleSystem(120);
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const tableGeo = new THREE.BoxGeometry(18, 0.35, 5.2);
        const tableMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.6, metalness: 0.1 });
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.set(0, 0.175, 0);
        table.receiveShadow = true;
        table.castShadow = true;
        worldGroup.add(table);

        const railGeo = new THREE.BoxGeometry(18, 0.22, 0.16);
        const railMat = new THREE.MeshStandardMaterial({ color: 0x8c8273, metalness: 0.3, roughness: 0.5 });
        const railFront = new THREE.Mesh(railGeo, railMat);
        railFront.position.set(0, 0.44, 2.5);
        const railBack = new THREE.Mesh(railGeo, railMat);
        railBack.position.set(0, 0.44, -2.5);
        worldGroup.add(railFront, railBack);

        for (let x = -8; x <= 8; x += 1) {
          const tickGeo = new THREE.BoxGeometry(0.04, 0.02, x % 2 === 0 ? 0.45 : 0.22);
          const tickMat = new THREE.MeshBasicMaterial({ color: x === 0 ? 0x8b261d : 0x57534e });
          const tick = new THREE.Mesh(tickGeo, tickMat);
          tick.position.set(x, 0.36, 2.1);
          worldGroup.add(tick);
        }

        const sphereGeo = new THREE.SphereGeometry(1, 48, 48);
        this.mat1 = new THREE.MeshPhysicalMaterial({ color: 0x1e3a5f, metalness: 0.25, roughness: 0.2, clearcoat: 0.6 });
        this.mat2 = new THREE.MeshPhysicalMaterial({ color: 0x8b261d, metalness: 0.25, roughness: 0.2, clearcoat: 0.6 });

        this.ball1 = new THREE.Mesh(sphereGeo, this.mat1);
        this.ball1.castShadow = true;
        this.ball1.receiveShadow = true;
        this.ball2 = new THREE.Mesh(sphereGeo, this.mat2);
        this.ball2.castShadow = true;
        this.ball2.receiveShadow = true;
        worldGroup.add(this.ball1, this.ball2);

        const ringGeo = new THREE.RingGeometry(0.15, 0.24, 36);
        this.shockMat = new THREE.MeshBasicMaterial({
          color: 0xb45309,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0
        });
        this.shockRing = new THREE.Mesh(ringGeo, this.shockMat);
        this.shockRing.rotation.y = Math.PI / 2;
        worldGroup.add(this.shockRing);
        this.shockTimer = 0;

        this.trail1Pts = [];
        this.trail2Pts = [];
        this.trail1Line = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.7 })
        );
        this.trail2Line = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: 0x8b261d, transparent: true, opacity: 0.7 })
        );
        worldGroup.add(this.trail1Line, this.trail2Line);

        this.v1Arrow = new SmartVectorArrow('v₁', 0x166534, '#166534');
        this.v2Arrow = new SmartVectorArrow('v₂', 0x166534, '#166534');
        this.p1Arrow = new SmartVectorArrow('p₁', 0x1e3a5f, '#1e3a5f');
        this.p2Arrow = new SmartVectorArrow('p₂', 0x8b261d, '#8b261d');
        this.arrows.push(this.v1Arrow, this.v2Arrow, this.p1Arrow, this.p2Arrow);
      }

      reset() {
        const p = sceneParams.collision;
        this.r1 = 0.42 * Math.cbrt(p.m1 / 2.0);
        this.r2 = 0.42 * Math.cbrt(p.m2 / 2.0);
        this.ball1.scale.setScalar(this.r1);
        this.ball2.scale.setScalar(this.r2);

        this.pos1 = new THREE.Vector3(-4.2, 0.35 + this.r1, p.impactOffset * 0.5);
        this.pos2 = new THREE.Vector3(0.5, 0.35 + this.r2, -p.impactOffset * 0.5);
        this.vel1 = new THREE.Vector3(p.v1, 0, 0);
        this.vel2 = new THREE.Vector3(p.v2, 0, 0);

        this.heatLoss = 0;
        this.initialEnergy = 0.5 * p.m1 * this.vel1.lengthSq() + 0.5 * p.m2 * this.vel2.lengthSq();
        this.shockMat.opacity = 0;

        this.trail1Pts = [this.pos1.clone()];
        this.trail2Pts = [this.pos2.clone()];
        this.particles.clear();
        this.syncVisuals();
      }

      update(dt) {
        const p = sceneParams.collision;
        const subSteps = 6;
        const subDt = dt / subSteps;

        for (let s = 0; s < subSteps; s++) {
          this.pos1.addScaledVector(this.vel1, subDt);
          this.pos2.addScaledVector(this.vel2, subDt);

          const delta = new THREE.Vector3().subVectors(this.pos2, this.pos1);
          delta.y = 0;
          const dist = delta.length();
          const minDist = this.r1 + this.r2;

          if (dist <= minDist && dist > 1e-5) {
            const normal = delta.clone().divideScalar(dist);
            const relVel = new THREE.Vector3().subVectors(this.vel1, this.vel2);
            const velAlongNormal = relVel.dot(normal);

            if (velAlongNormal > 0) {
              const overlap = minDist - dist;
              const totalMass = p.m1 + p.m2;
              this.pos1.addScaledVector(normal, -overlap * (p.m2 / totalMass));
              this.pos2.addScaledVector(normal, overlap * (p.m1 / totalMass));

              const e = p.restitution;
              const j = ((1 + e) * velAlongNormal) / (1 / p.m1 + 1 / p.m2);
              const impulse = normal.clone().multiplyScalar(j);

              const ekBefore = 0.5 * p.m1 * this.vel1.lengthSq() + 0.5 * p.m2 * this.vel2.lengthSq();
              this.vel1.sub(impulse.clone().divideScalar(p.m1));
              this.vel2.add(impulse.clone().divideScalar(p.m2));
              const ekAfter = 0.5 * p.m1 * this.vel1.lengthSq() + 0.5 * p.m2 * this.vel2.lengthSq();

              this.heatLoss += Math.max(0, ekBefore - ekAfter);

              const contactPoint = this.pos1.clone().addScaledVector(normal, this.r1);
              this.shockRing.position.copy(contactPoint);
              this.shockRing.lookAt(contactPoint.clone().add(normal));
              this.shockTimer = 1.0;

              this.particles.emit(contactPoint, 3.0, e < 0.95 ? 20 : 10, 0xb45309);
              transitionToPhase('explain');
            }
          }

          const zLimit1 = 2.4 - this.r1;
          if (Math.abs(this.pos1.z) > zLimit1) {
            this.pos1.z = Math.sign(this.pos1.z) * zLimit1;
            this.vel1.z *= -0.95;
          }
          const zLimit2 = 2.4 - this.r2;
          if (Math.abs(this.pos2.z) > zLimit2) {
            this.pos2.z = Math.sign(this.pos2.z) * zLimit2;
            this.vel2.z *= -0.95;
          }

          this.pos1.x = THREE.MathUtils.clamp(this.pos1.x, -8.4, 8.4);
          this.pos2.x = THREE.MathUtils.clamp(this.pos2.x, -8.4, 8.4);
        }

        if (this.shockTimer > 0) {
          this.shockTimer = Math.max(0, this.shockTimer - dt * 2.6);
          this.shockRing.scale.setScalar(1 + (1 - this.shockTimer) * 4.2);
          this.shockMat.opacity = this.shockTimer * 0.8;
        }

        this.trail1Pts.push(this.pos1.clone());
        this.trail2Pts.push(this.pos2.clone());
        if (this.trail1Pts.length > 200) this.trail1Pts.shift();
        if (this.trail2Pts.length > 200) this.trail2Pts.shift();

        this.particles.update(dt);
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.collision;
        this.ball1.position.copy(this.pos1);
        this.ball2.position.copy(this.pos2);

        this.trail1Line.visible = uiState.showTrails;
        this.trail2Line.visible = uiState.showTrails;
        if (uiState.showTrails) {
          this.trail1Line.geometry.setFromPoints(this.trail1Pts);
          this.trail2Line.geometry.setFromPoints(this.trail2Pts);
        }

        const p1Vec = this.vel1.clone().multiplyScalar(p.m1);
        const p2Vec = this.vel2.clone().multiplyScalar(p.m2);

        this.v1Arrow.update(
          this.pos1.clone().add(new THREE.Vector3(0, this.r1 + 0.15, 0)),
          this.vel1,
          this.vel1.length() * 0.35,
          uiState.showVectors,
          uiState.showLabels
        );
        this.v2Arrow.update(
          this.pos2.clone().add(new THREE.Vector3(0, this.r2 + 0.15, 0)),
          this.vel2,
          this.vel2.length() * 0.35,
          uiState.showVectors,
          uiState.showLabels
        );
        this.p1Arrow.update(this.pos1, p1Vec, p1Vec.length() * 0.18, uiState.showVectors, uiState.showLabels);
        this.p2Arrow.update(this.pos2, p2Vec, p2Vec.length() * 0.18, uiState.showVectors, uiState.showLabels);

        const ek = 0.5 * p.m1 * this.vel1.lengthSq() + 0.5 * p.m2 * this.vel2.lengthSq();
        const q = this.heatLoss;
        const totalPx = p.m1 * this.vel1.x + p.m2 * this.vel2.x;

        updateEnergyUI(ek, 0, q, Math.max(ek + q, this.initialEnergy, 0.1), [
          { label: 'v₁x', val: `${this.vel1.x.toFixed(2)} м/с` },
          { label: 'v₂x', val: `${this.vel2.x.toFixed(2)} м/с` },
          { label: 'p₁x + p₂x', val: `${totalPx.toFixed(2)} кг·м/с` },
          { label: 'Втрати Q', val: `${q.toFixed(2)} Дж` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 5. МОДУЛЬ § 2: РУХ ТІЛА НА ПОХИЛІЙ ПЛОЩИНІ
    // ============================================================================
    class InclineSimulation {
      constructor() {
        this.arrows = [];
        this.particles = new EnergyParticleSystem(140);
        this.rampLength = 10.0;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        this.inclinePivot = new THREE.Group();
        this.inclinePivot.position.set(-4.5, 0.2, 0);
        worldGroup.add(this.inclinePivot);

        const baseMesh = new THREE.Mesh(
          new THREE.BoxGeometry(10.5, 0.2, 3.2),
          new THREE.MeshStandardMaterial({ color: 0xc2b69f, roughness: 0.7 })
        );
        baseMesh.position.set(0.5, 0.1, 0);
        baseMesh.receiveShadow = true;
        worldGroup.add(baseMesh);

        const plankGeo = new THREE.BoxGeometry(this.rampLength, 0.28, 2.6);
        plankGeo.translate(this.rampLength / 2, -0.14, 0);
        this.plank = new THREE.Mesh(
          plankGeo,
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.55, metalness: 0.1 })
        );
        this.plank.castShadow = true;
        this.plank.receiveShadow = true;
        this.inclinePivot.add(this.plank);

        for (let s = 1; s < this.rampLength; s += 1) {
          const mark = new THREE.Mesh(
            new THREE.BoxGeometry(0.035, 0.02, 2.62),
            new THREE.MeshBasicMaterial({ color: 0x78716c })
          );
          mark.position.set(s, 0.01, 0);
          this.inclinePivot.add(mark);
        }

        this.blockWidth = 1.1;
        this.blockHeight = 0.7;
        this.block = new THREE.Mesh(
          new THREE.BoxGeometry(this.blockWidth, this.blockHeight, 1.1),
          new THREE.MeshPhysicalMaterial({ color: 0x1e3a5f, roughness: 0.25, metalness: 0.15, clearcoat: 0.5 })
        );
        this.block.castShadow = true;
        this.block.receiveShadow = true;
        this.inclinePivot.add(this.block);

        const pillarGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 16);
        pillarGeo.translate(0, 0.5, 0);
        this.pillar = new THREE.Mesh(
          pillarGeo,
          new THREE.MeshStandardMaterial({ color: 0x78716c, metalness: 0.4, roughness: 0.4 })
        );
        worldGroup.add(this.pillar);

        this.arcLine = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: 0x8b261d })
        );
        worldGroup.add(this.arcLine);

        this.mgArrow = new SmartVectorArrow('mg', 0xb91c1c, '#b91c1c');
        this.mgParArrow = new SmartVectorArrow('mg·sinα', 0x1d4ed8, '#1d4ed8');
        this.mgPerpArrow = new SmartVectorArrow('mg·cosα', 0x4338ca, '#4338ca');
        this.normArrow = new SmartVectorArrow('N', 0xb45309, '#b45309');
        this.fricArrow = new SmartVectorArrow('F_тер', 0x8b261d, '#8b261d');
        this.velArrow = new SmartVectorArrow('v', 0x166534, '#166534');
        this.arrows.push(this.mgArrow, this.mgParArrow, this.mgPerpArrow, this.normArrow, this.fricArrow, this.velArrow);
      }

      reset() {
        this.s = 1.4;
        this.v = 0.0;
        this.heatLoss = 0.0;
        this.particles.clear();
        this.syncVisuals();
      }

      update(dt) {
        const p = sceneParams.incline;
        const alpha = THREE.MathUtils.degToRad(p.angle);
        const gSin = p.gravity * Math.sin(alpha);
        const gCos = p.gravity * Math.cos(alpha);
        const maxStaticFrictionAcc = p.mu * gCos;

        if (Math.abs(this.v) < 1e-4 && gSin <= maxStaticFrictionAcc) {
          this.v = 0;
        } else {
          const acc = gSin - p.mu * gCos;
          const prevS = this.s;
          const maxS = this.rampLength - 1.0;

          if (this.s < maxS) {
            this.v += acc * dt;
            this.s = Math.min(maxS, this.s + this.v * dt);
            const ds = this.s - prevS;
            this.heatLoss += p.mu * p.mass * gCos * ds;

            if (p.mu > 0.01 && this.v > 0.2 && Math.random() < 0.7) {
              const worldBlockPos = new THREE.Vector3();
              this.block.getWorldPosition(worldBlockPos);
              worldBlockPos.y -= 0.25;
              this.particles.emit(worldBlockPos, 1.6, 2, 0xb45309);
            }

            if (this.s >= maxS) {
              this.v = 0;
              transitionToPhase('explain');
            }
          }
        }

        if (uiState.simTime > 0.85) transitionToPhase('explain');
        this.particles.update(dt);
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.incline;
        const alpha = THREE.MathUtils.degToRad(p.angle);
        this.inclinePivot.rotation.z = alpha;

        const localX = this.rampLength - this.s;
        this.block.position.set(localX, this.blockHeight / 2, 0);

        const topX = -4.5 + this.rampLength * Math.cos(alpha);
        const topY = 0.2 + this.rampLength * Math.sin(alpha);
        this.pillar.position.set(topX, 0.2, 0);
        this.pillar.scale.set(1, Math.max(0.1, topY - 0.2), 1);

        const arcPts = [];
        for (let i = 0; i <= 24; i++) {
          const a = (alpha * i) / 24;
          arcPts.push(new THREE.Vector3(-4.5 + 2.2 * Math.cos(a), 0.2 + 2.2 * Math.sin(a), 1.32));
        }
        this.arcLine.geometry.setFromPoints(arcPts);

        const centerWorld = new THREE.Vector3();
        this.block.getWorldPosition(centerWorld);

        const downSlopeDir = new THREE.Vector3(-Math.cos(alpha), -Math.sin(alpha), 0);
        const upSlopeDir = downSlopeDir.clone().negate();
        const normalOutDir = new THREE.Vector3(-Math.sin(alpha), Math.cos(alpha), 0);
        const normalInDir = normalOutDir.clone().negate();
        const gravityDir = new THREE.Vector3(0, -1, 0);

        const forceScale = 0.095;
        const mg = p.mass * p.gravity;
        const mgPar = mg * Math.sin(alpha);
        const mgPerp = mg * Math.cos(alpha);
        const fFric = Math.min(mgPar, p.mu * mgPerp);

        this.mgArrow.update(centerWorld, gravityDir, mg * forceScale, uiState.showVectors, uiState.showLabels);
        this.mgParArrow.update(centerWorld, downSlopeDir, mgPar * forceScale, uiState.showVectors, uiState.showLabels);
        this.mgPerpArrow.update(centerWorld, normalInDir, mgPerp * forceScale, uiState.showVectors, uiState.showLabels);
        this.normArrow.update(centerWorld, normalOutDir, mgPerp * forceScale, uiState.showVectors, uiState.showLabels);
        this.fricArrow.update(
          centerWorld.clone().addScaledVector(normalInDir, 0.25),
          upSlopeDir,
          fFric * forceScale,
          uiState.showVectors,
          uiState.showLabels
        );
        this.velArrow.update(
          centerWorld.clone().addScaledVector(normalOutDir, 0.45),
          downSlopeDir,
          this.v * 0.35,
          uiState.showVectors,
          uiState.showLabels
        );

        const hCurrent = Math.max(0, (localX - 1.0) * Math.sin(alpha));
        const hInitial = (this.rampLength - 1.4 - 1.0) * Math.sin(alpha);
        const ep = p.mass * p.gravity * hCurrent;
        const ek = 0.5 * p.mass * this.v * this.v;
        const q = this.heatLoss;
        const eTotalInitial = p.mass * p.gravity * hInitial;
        const netAcc = Math.max(0, p.gravity * (Math.sin(alpha) - p.mu * Math.cos(alpha)));

        updateEnergyUI(ek, ep, q, Math.max(eTotalInitial, ek + ep + q, 0.1), [
          { label: 'Прискорення a', val: `${netAcc.toFixed(2)} м/с²` },
          { label: 'Швидкість v', val: `${this.v.toFixed(2)} м/с` },
          { label: 'mg·sin α', val: `${mgPar.toFixed(1)} Н` },
          { label: 'Тертя F_тер', val: `${fFric.toFixed(1)} Н` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 6. МОДУЛЬ § 3: МАТЕМАТИЧНИЙ ТА ПРУЖИННИЙ МАЯТНИКИ
    // ============================================================================
    class PendulumSimulation {
      constructor() {
        this.arrows = [];
        this.particles = new EnergyParticleSystem(80);
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.4, roughness: 0.4 });
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.28, 0.5), frameMat);
        topBar.position.set(0, 6.2, 0);
        topBar.castShadow = true;

        const leftPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6.2, 20), frameMat);
        leftPillar.position.set(-4.0, 3.1, 0);
        leftPillar.castShadow = true;

        const rightPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6.2, 20), frameMat);
        rightPillar.position.set(4.0, 3.1, 0);
        rightPillar.castShadow = true;

        worldGroup.add(topBar, leftPillar, rightPillar);

        this.pivotMath = new THREE.Vector3(-1.8, 6.1, 0);
        const rodGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 12);
        rodGeo.translate(0, -0.5, 0);
        this.rodMesh = new THREE.Mesh(
          rodGeo,
          new THREE.MeshStandardMaterial({ color: 0x44403c, metalness: 0.6, roughness: 0.3 })
        );
        this.rodMesh.position.copy(this.pivotMath);
        worldGroup.add(this.rodMesh);

        this.bobMat = new THREE.MeshPhysicalMaterial({ color: 0x1e3a5f, roughness: 0.2, metalness: 0.25, clearcoat: 0.7 });
        this.bobMesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 36, 36), this.bobMat);
        this.bobMesh.castShadow = true;
        worldGroup.add(this.bobMesh);

        this.arcTrailLine = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.5 })
        );
        worldGroup.add(this.arcTrailLine);

        this.pivotSpring = new THREE.Vector3(1.8, 6.1, 0);
        this.springLine = new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0)]),
            64,
            0.04,
            8,
            false
          ),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.6, roughness: 0.3 })
        );
        worldGroup.add(this.springLine);

        this.weightMat = new THREE.MeshPhysicalMaterial({ color: 0x8b261d, roughness: 0.25, metalness: 0.2, clearcoat: 0.6 });
        this.weightMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.65, 32), this.weightMat);
        this.weightMesh.castShadow = true;
        worldGroup.add(this.weightMesh);

        this.tensionArrow = new SmartVectorArrow('T', 0xb45309, '#b45309');
        this.mgArrow = new SmartVectorArrow('mg', 0xb91c1c, '#b91c1c');
        this.velArrow = new SmartVectorArrow('v', 0x166534, '#166534');
        this.springForceArrow = new SmartVectorArrow('F_пруж', 0x1d4ed8, '#1d4ed8');
        this.arrows.push(this.tensionArrow, this.mgArrow, this.velArrow, this.springForceArrow);
      }

      updateSpringGeometry(topPos, bottomY) {
        const coils = 12;
        const radius = 0.24;
        const pts = [];
        const totalLen = topPos.y - bottomY;
        const steps = 90;

        pts.push(new THREE.Vector3(topPos.x, topPos.y, topPos.z));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const angle = t * coils * Math.PI * 2;
          const y = topPos.y - 0.15 - t * (totalLen - 0.3);
          pts.push(new THREE.Vector3(topPos.x + Math.cos(angle) * radius, y, topPos.z + Math.sin(angle) * radius));
        }
        pts.push(new THREE.Vector3(topPos.x, bottomY, topPos.z));

        const curve = new THREE.CatmullRomCurve3(pts);
        this.springLine.geometry.dispose();
        this.springLine.geometry = new THREE.TubeGeometry(curve, 100, 0.038, 8, false);
      }

      reset() {
        const p = sceneParams.pendulum;
        this.theta = THREE.MathUtils.degToRad(p.theta0);
        this.omega = 0.0;
        this.yDisp = 1.25 * (p.theta0 / 45);
        this.yVel = 0.0;
        this.initialMechEnergy = p.mass * p.gravity * p.length * (1 - Math.cos(this.theta));
        this.particles.clear();
        this.syncVisuals();
      }

      update(dt) {
        const p = sceneParams.pendulum;
        const subSteps = 6;
        const h = dt / subSteps;

        for (let i = 0; i < subSteps; i++) {
          const accelMath = (th, om) => -(p.gravity / p.length) * Math.sin(th) - 2 * p.damping * om;
          const k1Th = this.omega;
          const k1Om = accelMath(this.theta, this.omega);
          const k2Th = this.omega + 0.5 * h * k1Om;
          const k2Om = accelMath(this.theta + 0.5 * h * k1Th, this.omega + 0.5 * h * k1Om);
          const k3Th = this.omega + 0.5 * h * k2Om;
          const k3Om = accelMath(this.theta + 0.5 * h * k2Th, this.omega + 0.5 * h * k2Om);
          const k4Th = this.omega + h * k3Om;
          const k4Om = accelMath(this.theta + h * k3Th, this.omega + h * k3Om);

          this.theta += (h / 6) * (k1Th + 2 * k2Th + 2 * k3Th + k4Th);
          this.omega += (h / 6) * (k1Om + 2 * k2Om + 2 * k3Om + k4Om);

          const accelSpring = (y, v) => -(p.stiffness / p.mass) * y - 2 * p.damping * v;
          const s1Y = this.yVel;
          const s1V = accelSpring(this.yDisp, this.yVel);
          const s2Y = this.yVel + 0.5 * h * s1V;
          const s2V = accelSpring(this.yDisp + 0.5 * h * s1Y, this.yVel + 0.5 * h * s1V);
          const s3Y = this.yVel + 0.5 * h * s2V;
          const s3V = accelSpring(this.yDisp + 0.5 * h * s2Y, this.yVel + 0.5 * h * s2V);
          const s4Y = this.yVel + h * s3V;
          const s4V = accelSpring(this.yDisp + h * s3Y, this.yVel + h * s3V);

          this.yDisp += (h / 6) * (s1Y + 2 * s2Y + 2 * s3Y + s4Y);
          this.yVel += (h / 6) * (s1V + 2 * s2V + 2 * s3V + s4V);
        }

        if (uiState.simTime > 1.0) transitionToPhase('explain');
        this.particles.update(dt);
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.pendulum;
        const L = p.length;

        const bobX = this.pivotMath.x + L * Math.sin(this.theta);
        const bobY = this.pivotMath.y - L * Math.cos(this.theta);
        const bobPos = new THREE.Vector3(bobX, bobY, 0);

        this.bobMesh.position.copy(bobPos);
        this.rodMesh.scale.set(1, L, 1);
        this.rodMesh.rotation.z = this.theta;

        const vLinear = L * this.omega;
        const ek = 0.5 * p.mass * vLinear * vLinear;
        const ep = p.mass * p.gravity * L * (1 - Math.cos(this.theta));
        const currentMech = ek + ep;
        const q = Math.max(0, this.initialMechEnergy - currentMech);

        this.arcTrailLine.visible = uiState.showTrails;
        if (uiState.showTrails) {
          const maxAngle = THREE.MathUtils.degToRad(p.theta0);
          const pts = [];
          for (let i = -30; i <= 30; i++) {
            const a = (maxAngle * i) / 30;
            pts.push(new THREE.Vector3(this.pivotMath.x + L * Math.sin(a), this.pivotMath.y - L * Math.cos(a), 0));
          }
          this.arcTrailLine.geometry.setFromPoints(pts);
        }

        const eqY = 3.2;
        const weightY = eqY - this.yDisp;
        this.weightMesh.position.set(this.pivotSpring.x, weightY, 0);
        this.updateSpringGeometry(this.pivotSpring, weightY + 0.32);

        const stringDir = new THREE.Vector3(-Math.sin(this.theta), Math.cos(this.theta), 0);
        const tangentDir = new THREE.Vector3(Math.cos(this.theta), Math.sin(this.theta), 0).multiplyScalar(
          Math.sign(this.omega || 1)
        );
        const tensionMag = p.mass * p.gravity * Math.cos(this.theta) + p.mass * L * this.omega * this.omega;

        this.tensionArrow.update(bobPos, stringDir, tensionMag * 0.08, uiState.showVectors, uiState.showLabels);
        this.mgArrow.update(
          bobPos,
          new THREE.Vector3(0, -1, 0),
          p.mass * p.gravity * 0.08,
          uiState.showVectors,
          uiState.showLabels
        );
        this.velArrow.update(bobPos, tangentDir, Math.abs(vLinear) * 0.35, uiState.showVectors, uiState.showLabels);

        const springRestoringForce = -p.stiffness * this.yDisp;
        this.springForceArrow.update(
          this.weightMesh.position,
          new THREE.Vector3(0, Math.sign(springRestoringForce || 1), 0),
          Math.abs(springRestoringForce) * 0.09,
          uiState.showVectors,
          uiState.showLabels
        );

        const periodMath = 2 * Math.PI * Math.sqrt(L / p.gravity);
        const periodSpring = 2 * Math.PI * Math.sqrt(p.mass / p.stiffness);

        updateEnergyUI(ek, ep, q, Math.max(this.initialMechEnergy, 0.1), [
          { label: 'T (матем.)', val: `${periodMath.toFixed(2)} с` },
          { label: 'T (пружин.)', val: `${periodSpring.toFixed(2)} с` },
          { label: 'Швидкість |v|', val: `${Math.abs(vLinear).toFixed(2)} м/с` },
          { label: 'Натяг T', val: `${tensionMag.toFixed(1)} Н` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 7. МОДУЛЬ § 4: БАЛІСТИКА (РУХ ТІЛА ПІД КУТОМ ДО ГОРИЗОНТУ)
    // ============================================================================
    class ProjectileSimulation {
      constructor() {
        this.arrows = [];
        this.particles = new EnergyParticleSystem(120);
        this.startX = -6.5;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const pedGeo = new THREE.BoxGeometry(1.4, 1, 1.4);
        pedGeo.translate(0, 0.5, 0);
        this.pedestal = new THREE.Mesh(
          pedGeo,
          new THREE.MeshStandardMaterial({ color: 0xc2b69f, roughness: 0.6 })
        );
        this.pedestal.position.set(this.startX, 0, 0);
        this.pedestal.castShadow = true;
        this.pedestal.receiveShadow = true;
        worldGroup.add(this.pedestal);

        this.cannonPivot = new THREE.Group();
        worldGroup.add(this.cannonPivot);

        const barrelGeo = new THREE.CylinderGeometry(0.22, 0.28, 1.3, 24);
        barrelGeo.rotateZ(-Math.PI / 2);
        barrelGeo.translate(0.45, 0, 0);
        this.barrel = new THREE.Mesh(
          barrelGeo,
          new THREE.MeshStandardMaterial({ color: 0x44403c, metalness: 0.6, roughness: 0.3 })
        );
        this.barrel.castShadow = true;
        this.cannonPivot.add(this.barrel);

        this.projMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 32, 32),
          new THREE.MeshPhysicalMaterial({ color: 0x1e3a5f, roughness: 0.2, metalness: 0.25, clearcoat: 0.7 })
        );
        this.projMesh.castShadow = true;
        worldGroup.add(this.projMesh);

        this.vacuumLine = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineDashedMaterial({ color: 0x78716c, dashSize: 0.35, gapSize: 0.2 })
        );
        worldGroup.add(this.vacuumLine);

        this.actualLine = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: 0x8b261d })
        );
        worldGroup.add(this.actualLine);

        this.apexMarker = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.2, 0),
          new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.3 })
        );
        worldGroup.add(this.apexMarker);

        this.vArrow = new SmartVectorArrow('v', 0x166534, '#166534');
        this.vxArrow = new SmartVectorArrow('v_x', 0x1d4ed8, '#1d4ed8');
        this.vyArrow = new SmartVectorArrow('v_y', 0x6d28d9, '#6d28d9');
        this.mgArrow = new SmartVectorArrow('mg', 0xb91c1c, '#b91c1c');
        this.dragArrow = new SmartVectorArrow('F_оп', 0xb45309, '#b45309');
        this.arrows.push(this.vArrow, this.vxArrow, this.vyArrow, this.mgArrow, this.dragArrow);
      }

      computeVacuumCurve() {
        const p = sceneParams.projectile;
        const theta = THREE.MathUtils.degToRad(p.angle);
        const vx0 = p.v0 * Math.cos(theta);
        const vy0 = p.v0 * Math.sin(theta);

        const disc = vy0 * vy0 + 2 * p.gravity * p.h0;
        const tFlight = (vy0 + Math.sqrt(Math.max(0, disc))) / p.gravity;

        const pts = [];
        const steps = 80;
        for (let i = 0; i <= steps; i++) {
          const t = (tFlight * i) / steps;
          const x = this.startX + vx0 * t;
          const y = Math.max(0, p.h0 + vy0 * t - 0.5 * p.gravity * t * t);
          pts.push(new THREE.Vector3(x, y, -0.15));
        }
        this.vacuumLine.geometry.setFromPoints(pts);
        this.vacuumLine.computeLineDistances();
      }

      reset() {
        const p = sceneParams.projectile;
        const theta = THREE.MathUtils.degToRad(p.angle);

        this.pedestal.scale.set(1, Math.max(0.1, p.h0), 1);
        this.cannonPivot.position.set(this.startX, p.h0, 0);
        this.cannonPivot.rotation.z = theta;

        this.pos = new THREE.Vector3(this.startX, p.h0, 0);
        this.vel = new THREE.Vector3(p.v0 * Math.cos(theta), p.v0 * Math.sin(theta), 0);

        this.initialEnergy = 0.5 * p.mass * p.v0 * p.v0 + p.mass * p.gravity * p.h0;
        this.dragLoss = 0;
        this.impactEk = 0;
        this.maxHeight = p.h0;
        this.apexPos = this.pos.clone();
        this.landed = false;

        this.trailPts = [this.pos.clone()];
        this.computeVacuumCurve();
        this.particles.clear();
        this.syncVisuals();
      }

      update(dt) {
        if (this.landed) {
          this.particles.update(dt);
          return;
        }

        const p = sceneParams.projectile;
        const subSteps = 5;
        const h = dt / subSteps;

        for (let i = 0; i < subSteps; i++) {
          if (this.pos.y <= 0.20 && this.vel.y < 0) {
            this.impactEk = 0.5 * p.mass * this.vel.lengthSq();
            this.pos.y = 0.20;
            this.vel.set(0, 0, 0);
            this.landed = true;
            this.particles.emit(this.pos, 2.5, 16, 0xb45309);
            transitionToPhase('explain');
            break;
          }

          const speed = this.vel.length();
          const dragFactor = p.drag / p.mass;
          const ax = -dragFactor * speed * this.vel.x;
          const ay = -p.gravity - dragFactor * speed * this.vel.y;
          this.dragLoss += p.drag * speed * speed * speed * h;

          const prevVy = this.vel.y;
          this.vel.x += ax * h;
          this.vel.y += ay * h;
          this.pos.x += this.vel.x * h;
          this.pos.y += this.vel.y * h;

          if (this.pos.y > this.maxHeight) {
            this.maxHeight = this.pos.y;
            this.apexPos.copy(this.pos);
          }

          if (prevVy > 0 && this.vel.y <= 0) {
            this.particles.emit(this.pos, 1.4, 8, 0x1e3a5f);
            transitionToPhase('explain');
          }
        }

        this.trailPts.push(this.pos.clone());
        if (this.trailPts.length > 260) this.trailPts.shift();

        this.particles.update(dt);
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.projectile;
        this.projMesh.position.copy(this.pos);
        this.apexMarker.position.copy(this.apexPos);

        this.vacuumLine.visible = uiState.showTrails;
        this.actualLine.visible = uiState.showTrails;
        if (uiState.showTrails) {
          this.actualLine.geometry.setFromPoints(this.trailPts);
        }

        const vScale = 0.24;
        this.vArrow.update(this.pos, this.vel, this.vel.length() * vScale, uiState.showVectors, uiState.showLabels);
        this.vxArrow.update(
          this.pos,
          new THREE.Vector3(Math.sign(this.vel.x || 1), 0, 0),
          Math.abs(this.vel.x) * vScale,
          uiState.showVectors,
          uiState.showLabels
        );
        this.vyArrow.update(
          this.pos,
          new THREE.Vector3(0, Math.sign(this.vel.y || 1), 0),
          Math.abs(this.vel.y) * vScale,
          uiState.showVectors,
          uiState.showLabels
        );
        this.mgArrow.update(
          this.pos,
          new THREE.Vector3(0, -1, 0),
          p.mass * p.gravity * 0.08,
          uiState.showVectors,
          uiState.showLabels
        );

        const dragMag = p.drag * this.vel.lengthSq();
        this.dragArrow.update(
          this.pos,
          this.vel.clone().negate(),
          dragMag * 0.14,
          uiState.showVectors && p.drag > 0.001,
          uiState.showLabels && p.drag > 0.001
        );

        const ek = this.landed ? this.impactEk : 0.5 * p.mass * this.vel.lengthSq();
        const ep = this.landed ? 0 : p.mass * p.gravity * Math.max(0, this.pos.y);
        const q = this.dragLoss;
        const rangeX = Math.max(0, this.pos.x - this.startX);

        updateEnergyUI(ek, ep, q, Math.max(this.initialEnergy, 0.1), [
          { label: 'v_x (гориз.)', val: `${this.vel.x.toFixed(2)} м/с` },
          { label: 'v_y (верт.)', val: `${this.vel.y.toFixed(2)} м/с` },
          { label: 'Висота H_max', val: `${this.maxHeight.toFixed(2)} м` },
          { label: 'Дальність L', val: `${rangeX.toFixed(2)} м` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 8. НОВИЙ МОДУЛЬ § 5: КОЛИСКА НЬЮТОНА (5 ПІДВІШЕНИХ КУЛЬ)
    // ============================================================================
    class NewtonsCradleSimulation {
      constructor() {
        this.arrows = [];
        this.particles = new EnergyParticleSystem(100);
        this.numBalls = 5;
        this.ballRadius = 0.44;
        this.spacing = this.ballRadius * 2.002;
        this.pivotY = 5.6;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0xc2b69f, roughness: 0.65 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, 3.6), woodMat);
        base.position.set(0, 0.15, 0);
        base.receiveShadow = true;
        base.castShadow = true;
        worldGroup.add(base);

        const metalFrameMat = new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.6, roughness: 0.3 });
        for (const z of [-1.2, 1.2]) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6.4, 16), metalFrameMat);
          bar.rotation.z = Math.PI / 2;
          bar.position.set(0, this.pivotY, z);
          worldGroup.add(bar);

          for (const x of [-3.1, 3.1]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, this.pivotY, 16), metalFrameMat);
            leg.position.set(x, this.pivotY / 2, z);
            leg.castShadow = true;
            worldGroup.add(leg);
          }
        }

        const steelMat = new THREE.MeshPhysicalMaterial({
          color: 0x475569,
          metalness: 0.82,
          roughness: 0.15,
          clearcoat: 0.8
        });

        this.bobs = [];
        this.strings = [];

        for (let i = 0; i < this.numBalls; i++) {
          const anchorX = (i - (this.numBalls - 1) / 2) * this.spacing;
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.ballRadius, 36, 36), steelMat.clone());
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          worldGroup.add(mesh);

          const strLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0x44403c })
          );
          worldGroup.add(strLine);

          this.bobs.push({ anchorX, theta: 0, omega: 0, mesh });
          this.strings.push(strLine);

          const vArr = new SmartVectorArrow(`v_${i + 1}`, 0x166534, '#166534');
          this.arrows.push(vArr);
        }
      }

      reset() {
        const p = sceneParams.cradle;
        const th0 = -THREE.MathUtils.degToRad(p.theta0);

        for (let i = 0; i < this.numBalls; i++) {
          this.bobs[i].theta = i < p.liftedBalls ? th0 : 0;
          this.bobs[i].omega = 0;
        }

        const g = 9.81;
        this.initialEnergy = p.liftedBalls * 1.0 * g * p.length * (1 - Math.cos(th0));
        this.heatLoss = 0;
        this.particles.clear();
        this.syncVisuals();
      }

      update(dt) {
        const p = sceneParams.cradle;
        const L = p.length;
        const g = 9.81;
        const subSteps = 12;
        const h = dt / subSteps;

        for (let s = 0; s < subSteps; s++) {
          for (const b of this.bobs) {
            const alpha = -(g / L) * Math.sin(b.theta);
            b.omega += alpha * h;
            b.theta += b.omega * h;
          }

          // Обробка послідовних зіткнень сусідніх куль
          for (let pass = 0; pass < 3; pass++) {
            for (let i = 0; i < this.numBalls - 1; i++) {
              const b1 = this.bobs[i];
              const b2 = this.bobs[i + 1];

              const x1 = b1.anchorX + L * Math.sin(b1.theta);
              const x2 = b2.anchorX + L * Math.sin(b2.theta);
              const dist = x2 - x1;

              if (dist <= this.ballRadius * 2) {
                const overlapAngle = (this.ballRadius * 2 - dist) / L;
                b1.theta -= overlapAngle * 0.5;
                b2.theta += overlapAngle * 0.5;

                if (b1.omega > b2.omega) {
                  const e = p.restitution;
                  const om1 = b1.omega;
                  const om2 = b2.omega;
                  b1.omega = 0.5 * ((1 - e) * om1 + (1 + e) * om2);
                  b2.omega = 0.5 * ((1 + e) * om1 + (1 - e) * om2);

                  if (Math.abs(om1 - om2) > 0.6) {
                    const yContact = this.pivotY - L;
                    this.particles.emit(new THREE.Vector3((x1 + x2) * 0.5, yContact, 0), 1.8, 5, 0xb45309);
                    transitionToPhase('explain');
                  }
                }
              }
            }
          }
        }

        this.particles.update(dt);
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.cradle;
        const L = p.length;
        const g = 9.81;

        let ek = 0;
        let ep = 0;

        for (let i = 0; i < this.numBalls; i++) {
          const b = this.bobs[i];
          const x = b.anchorX + L * Math.sin(b.theta);
          const y = this.pivotY - L * Math.cos(b.theta);
          b.mesh.position.set(x, y, 0);

          // V-подібний біфілярний підвіс кожної кулі
          const pts = [
            new THREE.Vector3(b.anchorX, this.pivotY, -1.2),
            new THREE.Vector3(x, y + this.ballRadius * 0.85, 0),
            new THREE.Vector3(b.anchorX, this.pivotY, 1.2)
          ];
          this.strings[i].geometry.setFromPoints(pts);

          const v = L * b.omega;
          ek += 0.5 * v * v;
          ep += g * L * (1 - Math.cos(b.theta));

          const tangent = new THREE.Vector3(Math.cos(b.theta), Math.sin(b.theta), 0).multiplyScalar(Math.sign(v || 1));
          this.arrows[i].update(
            b.mesh.position.clone().add(new THREE.Vector3(0, -0.55, 0)),
            tangent,
            Math.abs(v) * 0.32,
            uiState.showVectors,
            uiState.showLabels
          );
        }

        const q = Math.max(0, this.initialEnergy - (ek + ep));
        const vFirst = L * this.bobs[0].omega;
        const vLast = L * this.bobs[this.numBalls - 1].omega;

        updateEnergyUI(ek, ep, q, Math.max(this.initialEnergy, 0.1), [
          { label: 'Швидкість v₁', val: `${vFirst.toFixed(2)} м/с` },
          { label: 'Швидкість v₅', val: `${vLast.toFixed(2)} м/с` },
          { label: 'Кут θ₁', val: `${THREE.MathUtils.radToDeg(this.bobs[0].theta).toFixed(1)}°` },
          { label: 'Кут θ₅', val: `${THREE.MathUtils.radToDeg(this.bobs[4].theta).toFixed(1)}°` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 9. НОВИЙ МОДУЛЬ § 6: РУХ ПО КОЛУ ТА ДОЦЕНТРОВА СИЛА (ОБЕРТОВИЙ ДИСК)
    // ============================================================================
    class CentripetalSimulation {
      constructor() {
        this.arrows = [];
        this.particles = new EnergyParticleSystem(120);
        this.diskRadius = 5.2;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        this.diskGroup = new THREE.Group();
        this.diskGroup.position.set(0, 0.3, 0);
        worldGroup.add(this.diskGroup);

        const diskMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(this.diskRadius, this.diskRadius, 0.25, 64),
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.65, metalness: 0.1 })
        );
        diskMesh.receiveShadow = true;
        diskMesh.castShadow = true;
        this.diskGroup.add(diskMesh);

        // Радіальні лінії на диску для наочності обертання
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const spoke = new THREE.Mesh(
            new THREE.BoxGeometry(this.diskRadius * 1.95, 0.02, 0.05),
            new THREE.MeshBasicMaterial({ color: 0xa89f8d })
          );
          spoke.position.y = 0.13;
          spoke.rotation.y = angle;
          this.diskGroup.add(spoke);
        }

        const spindle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.28, 0.9, 24),
          new THREE.MeshStandardMaterial({ color: 0x44403c, metalness: 0.6, roughness: 0.3 })
        );
        spindle.position.y = 0.25;
        this.diskGroup.add(spindle);

        this.puck = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.38, 32),
          new THREE.MeshPhysicalMaterial({ color: 0x1e3a5f, roughness: 0.2, metalness: 0.2, clearcoat: 0.6 })
        );
        this.puck.castShadow = true;
        worldGroup.add(this.puck);

        this.orbitLine = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.65 })
        );
        worldGroup.add(this.orbitLine);

        this.velArrow = new SmartVectorArrow('v (лінійна)', 0x166534, '#166534');
        this.fcArrow = new SmartVectorArrow('F_дц = mω²R', 0xb45309, '#b45309');
        this.arrows.push(this.velArrow, this.fcArrow);
      }

      reset() {
        const p = sceneParams.centripetal;
        this.angle = 0;
        this.rCurrent = p.radius;
        this.radialVel = 0;
        this.slipping = false;
        this.heatLoss = 0;
        this.trailPts = [];
        this.particles.clear();
        this.syncVisuals();
      }

      update(dt) {
        const p = sceneParams.centripetal;
        const g = 9.81;

        this.angle += p.omega * dt;
        this.diskGroup.rotation.y = this.angle;

        const aCentripetal = p.omega * p.omega * this.rCurrent;
        const aMaxFriction = p.mu * g;

        if (aCentripetal > aMaxFriction) {
          this.slipping = true;
          if (this.rCurrent < this.diskRadius - 0.42) {
            const radialAcc = aCentripetal - aMaxFriction;
            this.radialVel += radialAcc * dt;
            this.rCurrent = Math.min(this.diskRadius - 0.42, this.rCurrent + this.radialVel * dt);
            this.heatLoss += p.mu * p.mass * g * this.radialVel * dt;

            if (Math.random() < 0.7) {
              this.particles.emit(this.puck.position, 1.5, 2, 0xb45309);
            }
          } else {
            this.radialVel = 0;
          }
          transitionToPhase('explain');
        } else {
          this.slipping = false;
          this.radialVel = 0;
          this.rCurrent = THREE.MathUtils.lerp(this.rCurrent, p.radius, Math.min(1, dt * 6));
        }

        if (uiState.simTime > 1.2) transitionToPhase('explain');

        const x = this.rCurrent * Math.cos(-this.angle);
        const z = this.rCurrent * Math.sin(-this.angle);
        this.trailPts.push(new THREE.Vector3(x, 0.45, z));
        if (this.trailPts.length > 180) this.trailPts.shift();

        this.particles.update(dt);
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.centripetal;
        const g = 9.81;

        const x = this.rCurrent * Math.cos(-this.angle);
        const z = this.rCurrent * Math.sin(-this.angle);
        const puckPos = new THREE.Vector3(x, 0.62, z);
        this.puck.position.copy(puckPos);

        this.orbitLine.visible = uiState.showTrails;
        if (uiState.showTrails && this.trailPts.length > 1) {
          this.orbitLine.geometry.setFromPoints(this.trailPts);
        }

        const vLinear = p.omega * this.rCurrent;
        const tangentDir = new THREE.Vector3(Math.sin(-this.angle), 0, -Math.cos(-this.angle));
        const inwardDir = new THREE.Vector3(-Math.cos(-this.angle), 0, -Math.sin(-this.angle));

        const fCentripetal = p.mass * p.omega * p.omega * this.rCurrent;
        const fMaxFriction = p.mu * p.mass * g;

        this.velArrow.update(puckPos, tangentDir, vLinear * 0.32, uiState.showVectors, uiState.showLabels);
        this.fcArrow.update(
          puckPos,
          inwardDir,
          Math.min(fCentripetal, fMaxFriction) * 0.14,
          uiState.showVectors,
          uiState.showLabels
        );

        const ek = 0.5 * p.mass * (vLinear * vLinear + this.radialVel * this.radialVel);
        const epMargin = Math.max(0, (fMaxFriction - fCentripetal) * this.rCurrent);

        updateEnergyUI(ek, epMargin, this.heatLoss, Math.max(ek + epMargin + this.heatLoss, 10), [
          { label: 'Швидкість v = ωR', val: `${vLinear.toFixed(2)} м/с` },
          { label: 'a_дц = ω²R', val: `${(p.omega * p.omega * this.rCurrent).toFixed(2)} м/с²` },
          { label: 'Потрібна F_дц', val: `${fCentripetal.toFixed(1)} Н` },
          { label: 'Гранична F_тер', val: `${fMaxFriction.toFixed(1)} Н` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 10. НОВИЙ МОДУЛЬ § 7: ЗАКОН АРХІМЕДА ТА ПЛАВАННЯ ТІЛ (ГІДРОСТАТИКА)
    // ============================================================================
    class ArchimedesSimulation {
      constructor() {
        this.arrows = [];
        this.particles = new EnergyParticleSystem(100);
        this.bubbles = [];
        this.waterSurfaceY = 3.1;
        this.tankBottomY = 0.32;
        this.ripplePhase = 0;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Масивна лабораторна підставка під мензурку/акваріум
        const baseStand = new THREE.Mesh(
          new THREE.BoxGeometry(4.8, 0.3, 3.8),
          new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.5, metalness: 0.3 })
        );
        baseStand.position.set(0, 0.15, 0);
        baseStand.receiveShadow = true;
        worldGroup.add(baseStand);

        // Досліджуваний куб (рендериться всередині рідини, renderOrder = 1)
        this.cubeMesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshPhysicalMaterial({ color: 0xb91c1c, roughness: 0.28, metalness: 0.15, clearcoat: 0.6 })
        );
        this.cubeMesh.castShadow = true;
        this.cubeMesh.renderOrder = 1;
        worldGroup.add(this.cubeMesh);

        // Об'єм рідини всередині посудини (глибокий аквамариново-блакитний колір, FrontSide та polygonOffset проти миготіння)
        const waterGeo = new THREE.BoxGeometry(4.26, 1, 3.26);
        waterGeo.translate(0, 0.5, 0);
        this.waterMat = new THREE.MeshPhysicalMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.24,
          transparent: true,
          opacity: 0.62,
          roughness: 0.12,
          metalness: 0.05,
          depthWrite: false,
          side: THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1
        });
        this.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
        this.waterMesh.position.set(0, this.tankBottomY, 0);
        this.waterMesh.renderOrder = 2;
        worldGroup.add(this.waterMesh);

        // Верхнє дзеркало води (меніск / вільна поверхня рідини з яскравим контуром)
        const surfGeo = new THREE.PlaneGeometry(4.26, 3.26);
        surfGeo.rotateX(-Math.PI / 2);
        this.surfaceMat = new THREE.MeshPhysicalMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.35,
          transparent: true,
          opacity: 0.82,
          roughness: 0.06,
          clearcoat: 1.0,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        this.surfaceMesh = new THREE.Mesh(surfGeo, this.surfaceMat);
        this.surfaceMesh.renderOrder = 3;
        worldGroup.add(this.surfaceMesh);

        // Чітка рамка меніска по периметру поверхні води
        const rimPts = [
          new THREE.Vector3(-2.13, 0, -1.63),
          new THREE.Vector3(2.13, 0, -1.63),
          new THREE.Vector3(2.13, 0, 1.63),
          new THREE.Vector3(-2.13, 0, 1.63),
          new THREE.Vector3(-2.13, 0, -1.63)
        ];
        this.meniscusLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(rimPts),
          new THREE.LineBasicMaterial({ color: 0x0284c7, linewidth: 2 })
        );
        this.meniscusLine.renderOrder = 4;
        worldGroup.add(this.meniscusLine);

        // Хвильові кола на поверхні води навколо зануреного тіла
        const rippleGeo = new THREE.RingGeometry(0.65, 0.72, 48);
        rippleGeo.rotateX(-Math.PI / 2);
        this.rippleMat = new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        this.rippleRing = new THREE.Mesh(rippleGeo, this.rippleMat);
        this.rippleRing.renderOrder = 4;
        worldGroup.add(this.rippleRing);

        // Бульбашки повітря у товщі рідини (підкреслюють об'єм і густину рідини)
        const bubbleGeo = new THREE.SphereGeometry(0.055, 12, 12);
        const bubbleMat = new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.75,
          depthWrite: false
        });
        for (let i = 0; i < 28; i++) {
          const bMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
          bMesh.scale.setScalar(0.5 + Math.random() * 0.9);
          bMesh.renderOrder = 3;
          worldGroup.add(bMesh);
          this.bubbles.push({
            mesh: bMesh,
            x: (Math.random() - 0.5) * 3.8,
            z: (Math.random() - 0.5) * 2.8,
            yRel: Math.random(),
            speed: 0.12 + Math.random() * 0.22
          });
        }

        // Скляний акваріум / мензурка (depthWrite: false, FrontSide, щоб рідина всередині не миготіла)
        const tankGeo = new THREE.BoxGeometry(4.4, 4.3, 3.4);
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0xf8fafc,
          transparent: true,
          opacity: 0.16,
          roughness: 0.08,
          metalness: 0.05,
          depthWrite: false,
          side: THREE.FrontSide
        });
        const tank = new THREE.Mesh(tankGeo, glassMat);
        tank.position.set(0, 2.46, 0);
        tank.renderOrder = 5;
        worldGroup.add(tank);

        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(tankGeo),
          new THREE.LineBasicMaterial({ color: 0x57534e })
        );
        edges.position.copy(tank.position);
        worldGroup.add(edges);

        // Мірна шкала об'єму на передній стінці мензурки (поділки рівня рідини)
        for (let i = 1; i <= 14; i++) {
          const yTick = this.tankBottomY + i * 0.26;
          const isMajor = i % 2 === 0;
          const tickW = isMajor ? 0.48 : 0.24;
          const tickMesh = new THREE.Mesh(
            new THREE.BoxGeometry(tickW, 0.025, 0.02),
            new THREE.MeshBasicMaterial({ color: yTick === this.waterSurfaceY ? 0xb91c1c : 0x1e3a5f })
          );
          tickMesh.position.set(2.2 - tickW / 2 - 0.12, yTick, 1.71);
          worldGroup.add(tickMesh);
        }

        this.faArrow = new SmartVectorArrow('F_Архімеда', 0x0284c7, '#0284c7');
        this.mgArrow = new SmartVectorArrow('mg (тяжіння)', 0xb91c1c, '#b91c1c');
        this.velArrow = new SmartVectorArrow('v', 0x166534, '#166534');
        this.arrows.push(this.faArrow, this.mgArrow, this.velArrow);
      }

      reset() {
        const p = sceneParams.archimedes;
        this.side = p.volume;
        this.cubeMesh.scale.setScalar(this.side);
        this.yCenter = this.waterSurfaceY + 0.55; // Починаємо вище рівноваги для наочного занурення у рідину
        this.vy = 0;
        this.heatLoss = 0;
        this.ripplePhase = 0;
        this.particles.clear();
        this.syncVisuals();
      }

      submergedFraction(yCenter, side, surfaceY) {
        const bottom = yCenter - side / 2;
        const top = yCenter + side / 2;
        if (bottom >= surfaceY) return 0;
        if (top <= surfaceY) return 1;
        return (surfaceY - bottom) / side;
      }

      update(dt) {
        const p = sceneParams.archimedes;
        const g = 9.81;
        const V0 = Math.pow(this.side, 3);
        const mass = p.rhoBody * V0;

        const subSteps = 6;
        const h = dt / subSteps;

        for (let i = 0; i < subSteps; i++) {
          const frac = this.submergedFraction(this.yCenter, this.side, this.waterSurfaceY);
          const fArch = p.rhoFluid * g * (V0 * frac);
          const fGrav = mass * g;
          const fDrag = -p.viscosity * 650 * this.vy * (0.2 + frac * 0.8);

          const acc = (fArch - fGrav + fDrag) / mass;
          const prevVy = this.vy;
          this.vy += acc * h;
          this.yCenter += this.vy * h;

          this.heatLoss += Math.abs(fDrag * this.vy * h) * 0.001;

          const minCenterY = this.tankBottomY + this.side / 2;
          if (this.yCenter <= minCenterY) {
            this.yCenter = minCenterY;
            this.vy *= -0.25;
            transitionToPhase('explain');
          }

          if (prevVy < -0.2 && this.vy >= 0) {
            this.particles.emit(new THREE.Vector3(0, this.waterSurfaceY, 0), 1.6, 8, 0x0284c7);
            transitionToPhase('explain');
          }
        }

        // Анімація підйому мікробульбашок у рідині та брижів на воді
        this.ripplePhase = (this.ripplePhase + dt * 1.8) % 1.0;
        this.bubbles.forEach(b => {
          b.yRel = (b.yRel + dt * b.speed) % 1.0;
        });

        if (uiState.simTime > 1.2) transitionToPhase('explain');
        this.particles.update(dt);
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.archimedes;
        const g = 9.81;
        this.side = p.volume;
        this.cubeMesh.scale.setScalar(this.side);
        this.cubeMesh.position.set(0, this.yCenter, 0);

        // Колір рідини змінюється залежно від її густини (від світло-блакитного гасу до насиченого бірюзового розсолу)
        const fluidT = THREE.MathUtils.clamp((p.rhoFluid - 700) / 900, 0, 1);
        const fluidCol = new THREE.Color().setHSL(0.55 - fluidT * 0.06, 0.88, 0.48 - fluidT * 0.1);
        this.waterMat.color.copy(fluidCol);
        this.waterMat.emissive.copy(fluidCol);
        this.surfaceMat.color.copy(fluidCol).offsetHSL(0, 0, 0.12);

        const frac = this.submergedFraction(this.yCenter, this.side, this.waterSurfaceY);
        const V0 = Math.pow(this.side, 3);
        const displacedRise = (V0 * frac) / (4.28 * 3.28);
        const visualWaterHeight = (this.waterSurfaceY - this.tankBottomY) + displacedRise * 2.2;
        const actualSurfaceY = this.tankBottomY + visualWaterHeight;

        this.waterMesh.scale.set(1, Math.max(0.08, visualWaterHeight - 0.012), 1);
        this.surfaceMesh.position.set(0, actualSurfaceY, 0);
        this.meniscusLine.position.set(0, actualSurfaceY + 0.008, 0);

        // Хвилі на поверхні води
        const rippleScale = this.side * (0.75 + this.ripplePhase * 1.15);
        this.rippleRing.position.set(0, actualSurfaceY + 0.015, 0);
        this.rippleRing.scale.setScalar(rippleScale);
        this.rippleMat.opacity = frac > 0 && frac < 1 ? (1 - this.ripplePhase) * 0.75 : (1 - this.ripplePhase) * 0.35;

        // Оновлюємо положення мікробульбашок у товщі рідини
        this.bubbles.forEach(b => {
          b.mesh.position.set(b.x, this.tankBottomY + 0.08 + b.yRel * (visualWaterHeight - 0.15), b.z);
          b.mesh.visible = uiState.showParticles;
        });

        const fArch = (p.rhoFluid * g * V0 * frac) / 1000; // у кН
        const fGrav = (p.rhoBody * g * V0) / 1000;

        this.faArrow.update(
          this.cubeMesh.position,
          new THREE.Vector3(0, 1, 0),
          fArch * 0.16,
          uiState.showVectors,
          uiState.showLabels
        );
        this.mgArrow.update(
          this.cubeMesh.position,
          new THREE.Vector3(0, -1, 0),
          fGrav * 0.16,
          uiState.showVectors,
          uiState.showLabels
        );
        this.velArrow.update(
          this.cubeMesh.position.clone().add(new THREE.Vector3(this.side * 0.7, 0, 0)),
          new THREE.Vector3(0, Math.sign(this.vy || 1), 0),
          Math.abs(this.vy) * 0.45,
          uiState.showVectors,
          uiState.showLabels
        );

        const ek = 0.5 * (p.rhoBody * V0 * 0.001) * this.vy * this.vy * 10;
        const eqY =
          p.rhoBody < p.rhoFluid
            ? this.waterSurfaceY + this.side * (0.5 - p.rhoBody / p.rhoFluid)
            : this.tankBottomY + this.side / 2;
        const ep = Math.abs(this.yCenter - eqY) * 15;

        updateEnergyUI(ek, ep, this.heatLoss, Math.max(ek + ep + this.heatLoss, 15), [
          { label: 'F_Архімеда', val: `${fArch.toFixed(2)} кН` },
          { label: 'Сила тяжіння mg', val: `${fGrav.toFixed(2)} кН` },
          { label: 'Занурено V_зан/V₀', val: `${(frac * 100).toFixed(0)} %` },
          { label: 'Витіснено ΔV', val: `${(V0 * frac * 1000).toFixed(0)} л` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 11. НОВИЙ МОДУЛЬ § 8: ІДЕАЛЬНИЙ ГАЗ ПІД ПОРШНЕМ (МКТ ТА ТЕРМОДИНАМІКА)
    // ============================================================================
    class IdealGasSimulation {
      constructor() {
        this.arrows = [];
        this.cylRadius = 1.85;
        this.baseY = 0.4;
        this.molecules = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Основа циліндра з пальником
        const baseMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(this.cylRadius + 0.2, this.cylRadius + 0.3, 0.4, 36),
          new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.5, roughness: 0.4 })
        );
        baseMesh.position.set(0, 0.2, 0);
        baseMesh.receiveShadow = true;
        worldGroup.add(baseMesh);

        // Скляна колба циліндра
        const wallGeo = new THREE.CylinderGeometry(this.cylRadius, this.cylRadius, 5.2, 40, 1, true);
        const wallMat = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.26,
          roughness: 0.1,
          depthWrite: false,
          side: THREE.FrontSide
        });
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(0, this.baseY + 2.6, 0);
        wallMesh.renderOrder = 4;
        worldGroup.add(wallMesh);

        // Рухомий поршень зі штоком
        this.pistonGroup = new THREE.Group();
        const disk = new THREE.Mesh(
          new THREE.CylinderGeometry(this.cylRadius - 0.04, this.cylRadius - 0.04, 0.28, 36),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.55, roughness: 0.3 })
        );
        disk.castShadow = true;
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 1.4, 16),
          new THREE.MeshStandardMaterial({ color: 0x78716c, metalness: 0.6, roughness: 0.3 })
        );
        rod.position.y = 0.8;
        this.pistonGroup.add(disk, rod);
        worldGroup.add(this.pistonGroup);

        // Пул молекул газу
        const molGeo = new THREE.SphereGeometry(0.11, 16, 16);
        this.molMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.25, metalness: 0.2 });

        for (let i = 0; i < 70; i++) {
          const mesh = new THREE.Mesh(molGeo, this.molMat);
          worldGroup.add(mesh);
          this.molecules.push({
            mesh,
            pos: new THREE.Vector3(),
            vel: new THREE.Vector3()
          });
        }

        this.pGasArrow = new SmartVectorArrow('F_газу = P·S', 0x1d4ed8, '#1d4ed8');
        this.pExtArrow = new SmartVectorArrow('F_зовн (поршень)', 0xb91c1c, '#b91c1c');
        this.arrows.push(this.pGasArrow, this.pExtArrow);
      }

      targetPistonHeight() {
        const p = sceneParams.gas;
        return THREE.MathUtils.clamp((p.temperature / 300) * (1.5 / p.pistonLoad) * 2.4, 1.1, 4.6);
      }

      reset() {
        const p = sceneParams.gas;
        this.pistonH = this.targetPistonHeight();
        this.pistonVel = 0;

        const speedScale = Math.sqrt(p.temperature / 300) * 3.8;
        for (let i = 0; i < this.molecules.length; i++) {
          const m = this.molecules[i];
          m.mesh.visible = i < p.particleCount;
          const r = Math.sqrt(Math.random()) * (this.cylRadius - 0.22);
          const a = Math.random() * Math.PI * 2;
          m.pos.set(r * Math.cos(a), this.baseY + 0.2 + Math.random() * (this.pistonH - 0.4), r * Math.sin(a));

          const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          m.vel.copy(dir.multiplyScalar(speedScale * (0.75 + Math.random() * 0.5)));
        }

        this.syncVisuals();
      }

      update(dt) {
        const p = sceneParams.gas;
        const targetH = this.targetPistonHeight();

        // Плавний рух поршня під дією різниці тиску газу та зовнішнього навантаження
        const springK = 14.0;
        const damping = 5.5;
        const acc = (targetH - this.pistonH) * springK - this.pistonVel * damping;
        this.pistonVel += acc * dt;
        this.pistonH = THREE.MathUtils.clamp(this.pistonH + this.pistonVel * dt, 1.0, 4.8);

        const speedScale = Math.sqrt(p.temperature / 300) * 3.8;
        const rMax = this.cylRadius - 0.16;
        const yMin = this.baseY + 0.15;
        const yMax = this.baseY + this.pistonH - 0.2;

        for (let i = 0; i < this.molecules.length; i++) {
          const m = this.molecules[i];
          m.mesh.visible = i < p.particleCount;
          if (!m.mesh.visible) continue;

          // Підтримуємо середню швидкість відповідно до температури T
          const curSpeed = m.vel.length();
          if (curSpeed > 1e-4) {
            m.vel.multiplyScalar(THREE.MathUtils.lerp(1, speedScale / curSpeed, dt * 3));
          }

          m.pos.addScaledVector(m.vel, dt);

          // Пружні удари об стінки циліндра та рухомий поршень
          const rXZ = Math.hypot(m.pos.x, m.pos.z);
          if (rXZ > rMax) {
            const nx = m.pos.x / rXZ;
            const nz = m.pos.z / rXZ;
            m.pos.x = nx * rMax;
            m.pos.z = nz * rMax;
            const dot = m.vel.x * nx + m.vel.z * nz;
            m.vel.x -= 2 * dot * nx;
            m.vel.z -= 2 * dot * nz;
          }

          if (m.pos.y < yMin) {
            m.pos.y = yMin;
            m.vel.y = Math.abs(m.vel.y);
          } else if (m.pos.y > yMax) {
            m.pos.y = yMax;
            m.vel.y = -Math.abs(m.vel.y) + this.pistonVel;
          }

          m.mesh.position.copy(m.pos);
        }

        if (uiState.simTime > 1.0) transitionToPhase('explain');
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.gas;
        const pistonY = this.baseY + this.pistonH;
        this.pistonGroup.position.set(0, pistonY, 0);

        // Колір молекул змінюється від холодного синього до гарячого багряного зі зростанням T
        const tNorm = (p.temperature - 150) / 450;
        this.molMat.color.lerpColors(new THREE.Color(0x1e3a5f), new THREE.Color(0xb91c1c), tNorm);

        const fScale = p.pistonLoad * 0.75;
        this.pGasArrow.update(
          new THREE.Vector3(-0.45, pistonY - 0.1, 0),
          new THREE.Vector3(0, 1, 0),
          fScale,
          uiState.showVectors,
          uiState.showLabels
        );
        this.pExtArrow.update(
          new THREE.Vector3(0.45, pistonY + 0.2, 0),
          new THREE.Vector3(0, -1, 0),
          fScale,
          uiState.showVectors,
          uiState.showLabels
        );

        const rawVol = (p.temperature / 300) * (1.5 / p.pistonLoad) * 2.4;
        const internalU = (p.temperature / 300) * 45;
        const workA = p.pistonLoad * rawVol * 10;
        const vRms = Math.sqrt((3 * 8.314 * p.temperature) / 0.029); // для повітря (M = 29 г/моль)

        updateEnergyUI(internalU, workA, 0, Math.max(internalU + workA, 80), [
          { label: 'Температура T', val: `${p.temperature} К` },
          { label: 'Об’єм газу V', val: `${rawVol.toFixed(2)} л` },
          { label: 'Тиск P', val: `${p.pistonLoad.toFixed(1)} атм` },
          { label: 'Швидкість v_кв', val: `${vRms.toFixed(0)} м/с` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 11-А. НОВИЙ МОДУЛЬ § 9: СВІТЛОВИЙ ФРОНТ І ПРИНЦИП ГЮЙГЕНСА — ФРЕНЕЛЯ
    // ============================================================================
    class WavefrontHuygensSimulation {
      constructor() {
        this.arrows = [];
        this.boundaryY = 2.0;
        this.phaseOffset = 0;
        this.incFronts = [];
        this.refrFronts = [];
        this.reflFronts = [];
        this.wavelets = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Оптично густіше середовище (скляний/водний блок нижче межі y = 2.0)
        const blockGeo = new THREE.BoxGeometry(11.5, 1.98, 5.2);
        this.blockMat = new THREE.MeshPhysicalMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.14,
          transparent: true,
          opacity: 0.24,
          roughness: 0.1,
          metalness: 0.05,
          depthWrite: false,
          side: THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1
        });
        this.mediumBlock = new THREE.Mesh(blockGeo, this.blockMat);
        this.mediumBlock.position.set(0, 0.99, 0);
        this.mediumBlock.receiveShadow = true;
        this.mediumBlock.renderOrder = 1;
        worldGroup.add(this.mediumBlock);

        // Межа поділу двох середовищ (площина y = 2.0)
        const borderGeo = new THREE.PlaneGeometry(11.5, 5.2);
        const borderMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const borderPlane = new THREE.Mesh(borderGeo, borderMat);
        borderPlane.rotation.x = -Math.PI / 2;
        borderPlane.position.set(0, this.boundaryY + 0.01, 0);
        borderPlane.renderOrder = 2;
        worldGroup.add(borderPlane);

        // Перпендикуляр (нормаль) у точці падіння (x = 0)
        const normPts = [new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0, 4.9, 0)];
        const normGeo = new THREE.BufferGeometry().setFromPoints(normPts);
        const normLine = new THREE.Line(
          normGeo,
          new THREE.LineDashedMaterial({ color: 0x44403c, dashSize: 0.18, gapSize: 0.12 })
        );
        normLine.computeLineDistances();
        worldGroup.add(normLine);

        // Оптичні промені (падаючий, заломлений, відбитий)
        this.incRayMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0284c7, emissiveIntensity: 0.35 });
        this.refrRayMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0284c7, emissiveIntensity: 0.35 });
        this.reflRayMat = new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          transparent: true,
          opacity: 0.45
        });

        this.incRayMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 16), this.incRayMat);
        this.refrRayMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 16), this.refrRayMat);
        this.reflRayMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 12), this.reflRayMat);
        worldGroup.add(this.incRayMesh, this.refrRayMesh, this.reflRayMesh);

        // Плоскі світлові фронти (рухомі напівпрозорі пластини, перпендикулярні до променів)
        const frontGeo = new THREE.BoxGeometry(1.75, 0.035, 2.2);
        this.frontMatInc = new THREE.MeshPhysicalMaterial({
          color: 0x0284c7,
          emissive: 0x0284c7,
          emissiveIntensity: 0.25,
          transparent: true,
          opacity: 0.52,
          roughness: 0.15,
          depthWrite: false
        });
        this.frontMatRefr = new THREE.MeshPhysicalMaterial({
          color: 0x1d4ed8,
          emissive: 0x1d4ed8,
          emissiveIntensity: 0.28,
          transparent: true,
          opacity: 0.58,
          roughness: 0.15,
          depthWrite: false
        });
        this.frontMatRefl = new THREE.MeshPhysicalMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.25,
          roughness: 0.2,
          depthWrite: false
        });

        for (let i = 0; i < 7; i++) {
          const mInc = new THREE.Mesh(frontGeo, this.frontMatInc);
          const mRefr = new THREE.Mesh(frontGeo, this.frontMatRefr);
          const mRefl = new THREE.Mesh(frontGeo, this.frontMatRefl);
          mInc.renderOrder = 3;
          mRefr.renderOrder = 3;
          mRefl.renderOrder = 3;
          worldGroup.add(mInc, mRefr, mRefl);
          this.incFronts.push(mInc);
          this.refrFronts.push(mRefr);
          this.reflFronts.push(mRefl);
        }

        // Вторинні півсферичні хвилі Гюйгенса на межі поділу
        const waveletGeo = new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        this.waveletMat = new THREE.MeshBasicMaterial({
          color: 0x0284c7,
          wireframe: true,
          transparent: true,
          opacity: 0.42,
          depthWrite: false
        });

        const emitterX = [-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8];
        emitterX.forEach((xPos, idx) => {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.075, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xb45309 })
          );
          dot.position.set(xPos, this.boundaryY + 0.015, 0);
          dot.renderOrder = 4;
          worldGroup.add(dot);

          const shell = new THREE.Mesh(waveletGeo, this.waveletMat);
          shell.position.set(xPos, this.boundaryY, 0);
          shell.renderOrder = 3;
          worldGroup.add(shell);
          this.wavelets.push({ mesh: shell, dot, xPos, phaseShift: idx * 0.2 });
        });

        this.kIncArrow = new SmartVectorArrow('k₁ (падаючий фронт)', 0xb91c1c, '#b91c1c');
        this.kRefrArrow = new SmartVectorArrow('k₂ (заломлений фронт)', 0x1d4ed8, '#1d4ed8');
        this.kReflArrow = new SmartVectorArrow('k_відб', 0x166534, '#166534');
        this.arrows.push(this.kIncArrow, this.kRefrArrow, this.kReflArrow);
      }

      positionCylinderBetween(mesh, p1, p2) {
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        mesh.scale.set(1, len, 1);
        mesh.position.copy(p1).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      }

      reset() {
        this.phaseOffset = 0;
        this.syncVisuals();
      }

      update(dt) {
        this.phaseOffset = (this.phaseOffset + dt * 1.45) % 100;
        if (uiState.simTime > 1.1) transitionToPhase('explain');
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.wavefront;
        const alpha = THREE.MathUtils.degToRad(p.angle);
        const n1 = 1.0;
        const n2 = p.n2;
        const sinBeta = Math.min(0.99, (n1 / n2) * Math.sin(alpha));
        const beta = Math.asin(sinBeta);

        const waveCol = wavelengthToColor(p.wavelength);
        this.incRayMat.color.copy(waveCol);
        this.incRayMat.emissive.copy(waveCol);
        this.refrRayMat.color.copy(waveCol);
        this.refrRayMat.emissive.copy(waveCol);
        this.frontMatInc.color.copy(waveCol);
        this.frontMatInc.emissive.copy(waveCol);
        this.frontMatRefr.color.copy(waveCol);
        this.frontMatRefr.emissive.copy(waveCol);
        this.waveletMat.color.copy(waveCol);

        // Напрямні одиничні вектори променів
        const dirInc = new THREE.Vector3(Math.sin(alpha), -Math.cos(alpha), 0).normalize();
        const dirRefr = new THREE.Vector3(Math.sin(beta), -Math.cos(beta), 0).normalize();
        const dirRefl = new THREE.Vector3(Math.sin(alpha), Math.cos(alpha), 0).normalize();

        const hitPt = new THREE.Vector3(0, this.boundaryY, 0);
        const startInc = hitPt.clone().addScaledVector(dirInc, -3.5);
        const endRefr = hitPt.clone().addScaledVector(dirRefr, 2.3 / Math.max(0.25, Math.cos(beta)));
        const endRefl = hitPt.clone().addScaledVector(dirRefl, 3.0);

        this.positionCylinderBetween(this.incRayMesh, startInc, hitPt);
        this.positionCylinderBetween(this.refrRayMesh, hitPt, endRefr);
        this.positionCylinderBetween(this.reflRayMesh, hitPt, endRefl);

        // Крок хвильового фронту в повітрі та у середовищі (стиснення в n2 разів!)
        const lambdaScale = p.wavelength / 550;
        const stepAir = 0.56 * lambdaScale;
        const stepMed = stepAir / n2;

        const qInc = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirInc);
        const qRefr = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirRefr);
        const qRefl = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirRefl);

        const frac = this.phaseOffset % 1;

        for (let i = 0; i < this.incFronts.length; i++) {
          const distInc = (i + (1 - frac)) * stepAir;
          const fInc = this.incFronts[i];
          fInc.position.copy(hitPt).addScaledVector(dirInc, -distInc);
          fInc.quaternion.copy(qInc);
          fInc.visible = distInc < 3.45;

          const distRefr = (i + frac) * stepMed;
          const fRefr = this.refrFronts[i];
          fRefr.position.copy(hitPt).addScaledVector(dirRefr, distRefr);
          fRefr.quaternion.copy(qRefr);
          fRefr.visible = fRefr.position.y > 0.12;

          const distRefl = (i + frac) * stepAir;
          const fRefl = this.reflFronts[i];
          fRefl.position.copy(hitPt).addScaledVector(dirRefl, distRefl);
          fRefl.quaternion.copy(qRefl);
          fRefl.visible = uiState.showTrails && distRefl < 2.85;
        }

        // Вторинні сферичні хвилі Гюйгенса (з урахуванням кількості джерел waveletCount)
        const activeCount = p.waveletCount || 5;
        this.wavelets.forEach((w, idx) => {
          const isWithinCount = idx < activeCount;
          w.mesh.visible = uiState.showParticles && isWithinCount;
          w.dot.visible = uiState.showParticles && isWithinCount;
          const r = (((this.phaseOffset + w.phaseShift) % 1.0) * 1.35) / n2;
          w.mesh.scale.setScalar(Math.max(0.05, r));
        });

        // Вектори хвильових нормалей
        this.kIncArrow.update(
          hitPt.clone().addScaledVector(dirInc, -1.6),
          dirInc,
          1.35,
          uiState.showVectors,
          uiState.showLabels
        );
        this.kRefrArrow.update(
          hitPt.clone().addScaledVector(dirRefr, 0.8),
          dirRefr,
          1.35 / n2,
          uiState.showVectors,
          uiState.showLabels
        );
        this.kReflArrow.update(
          hitPt.clone().addScaledVector(dirRefl, 0.9),
          dirRefl,
          0.95,
          uiState.showVectors,
          uiState.showLabels
        );

        // Коефіцієнти відбиття R та пропускання T за формулами Френеля
        const rS = Math.pow(
          (n1 * Math.cos(alpha) - n2 * Math.cos(beta)) / (n1 * Math.cos(alpha) + n2 * Math.cos(beta)),
          2
        );
        const reflPct = Math.min(99, rS * 100);
        const transPct = 100 - reflPct;
        const v2 = 300000 / n2;
        const lambda2 = p.wavelength / n2;

        updateEnergyUI(transPct, reflPct, 0, 100, [
          { label: 'Кут заломлення β', val: `${THREE.MathUtils.radToDeg(beta).toFixed(1)}°` },
          { label: 'Швидкість фронту v₂', val: `${(v2 / 1000).toFixed(0)} тис. км/с` },
          { label: 'Довжина хвилі λ₂', val: `${lambda2.toFixed(0)} нм` },
          { label: 'Пропускання T', val: `${transPct.toFixed(1)} %` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 11-Б. НОВИЙ МОДУЛЬ § 10: ІНТЕРФЕРЕНЦІЯ СВІТЛОВИХ ФРОНТІВ (ДОСЛІД ЮНГА У 3D)
    // ============================================================================
    class YoungInterferenceSimulation {
      constructor() {
        this.arrows = [];
        this.ringsS1 = [];
        this.ringsS2 = [];
        this.phase = 0;
        this.slitX = -3.6;
        this.tableY = 1.65;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Непрозора ширма з двома когерентними щілинами S1 та S2
        const barrierMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.6, metalness: 0.2 });
        this.barrierLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 2.2), barrierMat);
        this.barrierCenter = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 1.0), barrierMat);
        this.barrierRight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 2.2), barrierMat);
        worldGroup.add(this.barrierLeft, this.barrierCenter, this.barrierRight);

        // Світні щілини S1 та S2
        this.slitMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
        this.slit1Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.8, 0.12), this.slitMat);
        this.slit2Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.8, 0.12), this.slitMat);
        worldGroup.add(this.slit1Mesh, this.slit2Mesh);

        // Циліндричні хвильові фронти від S1 та S2 (півкільця у площині поширення)
        const ringGeo = new THREE.RingGeometry(0.96, 1.0, 48, 1, -Math.PI / 2, Math.PI);
        ringGeo.rotateX(-Math.PI / 2);
        this.ringMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide
        });

        for (let i = 0; i < 9; i++) {
          const r1 = new THREE.Mesh(ringGeo, this.ringMat);
          const r2 = new THREE.Mesh(ringGeo, this.ringMat);
          worldGroup.add(r1, r2);
          this.ringsS1.push(r1);
          this.ringsS2.push(r2);
        }

        // Екран спостереження інтерференційних смуг з динамічною текстурою
        this.fringeCanvas = document.createElement('canvas');
        this.fringeCanvas.width = 512;
        this.fringeCanvas.height = 128;
        this.fringeCtx = this.fringeCanvas.getContext('2d');
        this.fringeTexture = new THREE.CanvasTexture(this.fringeCanvas);

        this.screenGroup = new THREE.Group();
        const screenBoard = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 2.7, 6.2),
          new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.7 })
        );
        const fringePlane = new THREE.Mesh(
          new THREE.PlaneGeometry(5.8, 2.3),
          new THREE.MeshBasicMaterial({ map: this.fringeTexture, side: THREE.DoubleSide })
        );
        fringePlane.rotation.y = -Math.PI / 2;
        fringePlane.position.x = -0.1;
        this.screenGroup.add(screenBoard, fringePlane);
        worldGroup.add(this.screenGroup);

        // 3D-огинаюча розподілу інтенсивності I(z) перед екраном
        this.intensityCurveGeo = new THREE.BufferGeometry();
        this.intensityCurveLine = new THREE.Line(
          this.intensityCurveGeo,
          new THREE.LineBasicMaterial({ color: 0xb91c1c, linewidth: 2 })
        );
        worldGroup.add(this.intensityCurveLine);

        this.ray1Arrow = new SmartVectorArrow('Хвиля r₁ (від S₁)', 0x166534, '#166534');
        this.ray2Arrow = new SmartVectorArrow('Хвиля r₂ (від S₂)', 0x1d4ed8, '#1d4ed8');
        this.arrows.push(this.ray1Arrow, this.ray2Arrow);
      }

      reset() {
        this.phase = 0;
        this.syncVisuals();
      }

      update(dt) {
        this.phase = (this.phase + dt * 1.6) % 100;
        if (uiState.simTime > 1.1) transitionToPhase('explain');
        this.syncVisuals();
      }

      drawFringePattern(col, deltaYScene) {
        const ctx = this.fringeCtx;
        const w = this.fringeCanvas.width;
        const h = this.fringeCanvas.height;
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, w, h);

        const r = Math.round(col.r * 255);
        const g = Math.round(col.g * 255);
        const b = Math.round(col.b * 255);

        for (let x = 0; x < w; x++) {
          const zScene = ((x / w) - 0.5) * 5.8;
          const cosVal = Math.cos((Math.PI * zScene) / Math.max(0.25, deltaYScene));
          const envelope = Math.exp(-0.08 * zScene * zScene);
          const intensity = Math.pow(cosVal, 2) * envelope;

          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${intensity.toFixed(3)})`;
          ctx.fillRect(x, 0, 1, h);
        }
        this.fringeTexture.needsUpdate = true;
      }

      syncVisuals() {
        const p = sceneParams.interference;
        const waveCol = wavelengthToColor(p.wavelength);
        this.slitMat.color.copy(waveCol);
        this.ringMat.color.copy(waveCol);

        // Відстань між щілинами у сцені
        const halfD = p.slitD * 0.5;
        this.barrierCenter.scale.z = Math.max(0.2, halfD * 1.7);
        this.barrierCenter.position.set(this.slitX, 1.5, 0);
        this.barrierLeft.position.set(this.slitX, 1.5, halfD + 1.25);
        this.barrierRight.position.set(this.slitX, 1.5, -(halfD + 1.25));

        this.slit1Mesh.position.set(this.slitX, 1.5, halfD);
        this.slit2Mesh.position.set(this.slitX, 1.5, -halfD);

        const screenX = this.slitX + p.screenL * 1.15;
        this.screenGroup.position.set(screenX, 1.5, 0);

        // Ширина інтерференційної смуги Δz = L * λ / d
        const deltaY_mm = (p.screenL * (p.wavelength * 1e-3)) / p.slitD;
        const deltaYScene = Math.max(0.32, deltaY_mm * 0.55);

        this.drawFringePattern(waveCol, deltaYScene);

        // Оновлюємо циліндричні хвильові фронти від обох щілин
        const maxRadius = p.screenL * 1.15;
        const stepR = maxRadius / this.ringsS1.length;
        const frac = this.phase % 1.0;

        for (let i = 0; i < this.ringsS1.length; i++) {
          const rad = (i + frac) * stepR;
          const r1 = this.ringsS1[i];
          const r2 = this.ringsS2[i];

          r1.position.set(this.slitX, this.tableY, halfD);
          r2.position.set(this.slitX, this.tableY, -halfD);
          r1.scale.setScalar(Math.max(0.05, rad));
          r2.scale.setScalar(Math.max(0.05, rad));
          r1.visible = rad < maxRadius;
          r2.visible = rad < maxRadius;
        }

        // 3D графік інтенсивності I(z) уздовж екрана
        const pts = [];
        for (let i = 0; i <= 120; i++) {
          const z = -2.8 + (i / 120) * 5.6;
          const cosVal = Math.cos((Math.PI * z) / Math.max(0.25, deltaYScene));
          const env = Math.exp(-0.08 * z * z);
          const inten = Math.pow(cosVal, 2) * env;
          pts.push(new THREE.Vector3(screenX - 0.18 - inten * 0.55, 0.55 + inten * 1.85, z));
        }
        this.intensityCurveGeo.setFromPoints(pts);
        this.intensityCurveLine.visible = uiState.showTrails;

        // Вектори променів до точки спостереження P на екрані (probeZ)
        const zProbe = p.probeZ !== undefined ? p.probeZ : 0.8;
        const targetPt = new THREE.Vector3(screenX - 0.1, this.tableY, zProbe);
        const s1Pos = new THREE.Vector3(this.slitX, this.tableY, halfD);
        const s2Pos = new THREE.Vector3(this.slitX, this.tableY, -halfD);

        const v1 = new THREE.Vector3().subVectors(targetPt, s1Pos);
        const v2 = new THREE.Vector3().subVectors(targetPt, s2Pos);

        this.ray1Arrow.update(s1Pos, v1.clone().normalize(), v1.length() * 0.52, uiState.showVectors, uiState.showLabels);
        this.ray2Arrow.update(s2Pos, v2.clone().normalize(), v2.length() * 0.52, uiState.showVectors, uiState.showLabels);

        const numFringes = Math.max(1, Math.round(5.6 / deltaYScene));
        const probeCos = Math.cos((Math.PI * zProbe) / Math.max(0.05, deltaY_mm));
        const probeI = Math.pow(probeCos, 2) * 100;

        updateEnergyUI(probeI, 100 - probeI, 0, 100, [
          { label: 'Крок смуг Δz', val: `${deltaY_mm.toFixed(2)} мм` },
          { label: 'Довжина хвилі λ', val: `${p.wavelength} нм` },
          { label: 'Максимумів на екрані', val: `${numFringes}` },
          { label: 'Інтенсивність I(P)', val: `${probeI.toFixed(0)} %` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 11-В. НОВИЙ МОДУЛЬ § 11: ДИСПЕРСІЯ СВІТЛА ТА СПЕКТР У ТРИГРАННІЙ ПРИЗМІ
    // ============================================================================
    class PrismDispersionSimulation {
      constructor() {
        this.arrows = [];
        this.spectralBands = [
          { name: 'Червоний', lambda: 680, hex: 0xef4444 },
          { name: 'Оранжевий', lambda: 615, hex: 0xf97316 },
          { name: 'Жовтий', lambda: 580, hex: 0xeab308 },
          { name: 'Зелений', lambda: 530, hex: 0x22c55e },
          { name: 'Блакитний', lambda: 485, hex: 0x06b6d4 },
          { name: 'Синій', lambda: 445, hex: 0x3b82f6 },
          { name: 'Фіолетовий', lambda: 405, hex: 0x8b5cf6 }
        ];
        this.spectralMeshes = [];
        this.wavefrontMarkers = [];
        this.phase = 0;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Підставка під скляну призму
        const pedestal = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.75, 0.7, 32),
          new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.5, metalness: 0.3 })
        );
        pedestal.position.set(0, 0.35, 0);
        pedestal.receiveShadow = true;
        worldGroup.add(pedestal);

        // Тригранна скляна призма (динамічна геометрія для заломного кута φ)
        this.prismMat = new THREE.MeshPhysicalMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.42,
          roughness: 0.08,
          metalness: 0.05,
          clearcoat: 1.0,
          depthWrite: false,
          side: THREE.FrontSide
        });
        this.prismMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.prismMat);
        this.prismMesh.castShadow = true;
        this.prismMesh.renderOrder = 3;
        worldGroup.add(this.prismMesh);

        // Джерело вузького білого пучка світла ліворуч
        this.emitterMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.28, 0.9, 24),
          new THREE.MeshStandardMaterial({ color: 0x292524, metalness: 0.6, roughness: 0.35 })
        );
        worldGroup.add(this.emitterMesh);

        // Білий промінь до призми
        this.whiteRayMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 1, 16),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        worldGroup.add(this.whiteRayMesh);

        // 7 спектральних пучків всередині призми та після виходу з неї + хвильові фронти
        const wfGeo = new THREE.BoxGeometry(0.32, 0.03, 0.75);
        this.spectralBands.forEach(band => {
          const mat = new THREE.MeshBasicMaterial({ color: band.hex, transparent: true, opacity: 0.88, depthWrite: false });
          const insideMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 1, 12), mat);
          const outsideMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 1, 12), mat);
          const wfMesh = new THREE.Mesh(wfGeo, mat);
          insideMesh.renderOrder = 2;
          outsideMesh.renderOrder = 2;
          wfMesh.renderOrder = 4;
          worldGroup.add(insideMesh, outsideMesh, wfMesh);
          this.spectralMeshes.push({ insideMesh, outsideMesh, wfMesh, band });
        });

        // Екран проєкції спектра праворуч
        this.screenMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 3.6, 2.4),
          new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.7 })
        );
        this.screenMesh.position.set(4.5, 2.0, 0);
        worldGroup.add(this.screenMesh);

        this.kWhiteArrow = new SmartVectorArrow('Білий світловий фронт', 0x44403c, '#44403c');
        this.kRedArrow = new SmartVectorArrow('Червоний (680 нм)', 0xb91c1c, '#b91c1c');
        this.kViolArrow = new SmartVectorArrow('Фіолетовий (405 нм)', 0x6d28d9, '#6d28d9');
        this.arrows.push(this.kWhiteArrow, this.kRedArrow, this.kViolArrow);
      }

      updatePrismGeometry(apexAngleDeg) {
        const phi = THREE.MathUtils.degToRad(apexAngleDeg);
        const h = 2.45;
        const halfBase = h * Math.tan(phi / 2);
        const yBase = 0.7;
        const yApex = yBase + h;

        const shape = new THREE.Shape();
        shape.moveTo(-halfBase, yBase);
        shape.lineTo(halfBase, yBase);
        shape.lineTo(0, yApex);
        shape.closePath();

        const extrudeGeo = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false });
        extrudeGeo.translate(0, 0, -1.1);
        this.prismMesh.geometry.dispose();
        this.prismMesh.geometry = extrudeGeo;
      }

      positionBeam(mesh, p1, p2) {
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        mesh.scale.set(1, len, 1);
        mesh.position.copy(p1).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      }

      reset() {
        this.phase = 0;
        this.syncVisuals();
      }

      update(dt) {
        this.phase = (this.phase + dt * 1.4) % 100;
        if (uiState.simTime > 1.1) transitionToPhase('explain');
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.dispersion;
        this.updatePrismGeometry(p.apexAngle);

        const phi = THREE.MathUtils.degToRad(p.apexAngle);
        const h = 2.45;
        const halfBase = h * Math.tan(phi / 2);
        const yBase = 0.7;
        const yApex = yBase + h;

        // Точка входу білого променя на лівій грані призми
        const entryY = yBase + h * 0.52;
        const entryX = -halfBase * (1 - 0.52);
        const entryPt = new THREE.Vector3(entryX, entryY, 0);

        const incSlope = THREE.MathUtils.degToRad(p.incAngle - 28);
        const incDir = new THREE.Vector3(Math.cos(incSlope), Math.sin(incSlope), 0).normalize();
        const emitterPos = entryPt.clone().addScaledVector(incDir, -3.2);

        this.emitterMesh.position.copy(emitterPos);
        this.emitterMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), incDir);
        this.positionBeam(this.whiteRayMesh, emitterPos, entryPt);

        const screenX = 4.4;
        const frac = this.phase % 1.0;

        let redDirOut = new THREE.Vector3(1, -0.2, 0);
        let violDirOut = new THREE.Vector3(1, -0.5, 0);
        let exitRedPt = new THREE.Vector3();
        let exitViolPt = new THREE.Vector3();

        this.spectralMeshes.forEach((item, idx) => {
          // Показник заломлення за формулою Коші: n(λ) = n0 + B / λ^2
          const lambdaUm = item.band.lambda / 1000;
          const nLambda = p.n0 + (p.cauchyB * 0.25) / (lambdaUm * lambdaUm);

          // Відхилення всередині та після призми пропорційне (n(λ) - 1) * φ та залежить від кута падіння incAngle
          const spreadFactor = (nLambda - 1.45) * (p.apexAngle / 60);
          const incShift = (p.incAngle - 45) * 0.0045;
          const insideSlope = -0.06 + incShift - (idx / 6) * 0.14 * (p.cauchyB / 0.06);
          const exitY = THREE.MathUtils.clamp(entryY + insideSlope * (2 * Math.abs(entryX)), yBase + 0.25, yApex - 0.25);
          const exitX = halfBase * (1 - (exitY - yBase) / h);
          const exitPt = new THREE.Vector3(exitX, exitY, 0);

          const outAngle = -0.18 + incShift * 0.8 - spreadFactor * 0.52 - (idx / 6) * 0.16 * (p.cauchyB / 0.06);
          const outDir = new THREE.Vector3(Math.cos(outAngle), Math.sin(outAngle), 0).normalize();
          const distToScreen = (screenX - exitX) / Math.max(0.2, outDir.x);
          const screenHit = exitPt.clone().addScaledVector(outDir, distToScreen);

          this.positionBeam(item.insideMesh, entryPt, exitPt);
          this.positionBeam(item.outsideMesh, exitPt, screenHit);

          // Рухомий світловий фронт уздовж кожного спектрального променя
          const wfDist = ((frac + idx * 0.08) % 1.0) * distToScreen;
          item.wfMesh.position.copy(exitPt).addScaledVector(outDir, wfDist);
          item.wfMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outDir);
          item.wfMesh.visible = uiState.showParticles;

          if (idx === 0) {
            redDirOut.copy(outDir);
            exitRedPt.copy(exitPt);
          }
          if (idx === this.spectralMeshes.length - 1) {
            violDirOut.copy(outDir);
            exitViolPt.copy(exitPt);
          }
        });

        this.kWhiteArrow.update(
          emitterPos.clone().addScaledVector(incDir, 1.2),
          incDir,
          1.2,
          uiState.showVectors,
          uiState.showLabels
        );
        this.kRedArrow.update(exitRedPt, redDirOut, 1.35, uiState.showVectors, uiState.showLabels);
        this.kViolArrow.update(exitViolPt, violDirOut, 1.35, uiState.showVectors, uiState.showLabels);

        const nRed = p.n0 + (p.cauchyB * 0.25) / (0.68 * 0.68);
        const nViol = p.n0 + (p.cauchyB * 0.25) / (0.405 * 0.405);
        const deltaThetaDeg = THREE.MathUtils.radToDeg(redDirOut.angleTo(violDirOut));

        updateEnergyUI(nRed * 30, nViol * 30, 0, 110, [
          { label: 'n(черв, 680 нм)', val: nRed.toFixed(3) },
          { label: 'n(фіол, 405 нм)', val: nViol.toFixed(3) },
          { label: 'Кутова ширина Δδ', val: `${deltaThetaDeg.toFixed(1)}°` },
          { label: 'Швидкість v_фіол', val: `${(300 / nViol).toFixed(0)} тис. км/с` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 11-Г. НОВИЙ МОДУЛЬ § 12: ЕЛЕКТРОМАГНІТНА СВІТЛОВА ХВИЛЯ (E ⊥ B ⊥ k)
    // ============================================================================
    class ElectromagneticWaveSimulation {
      constructor() {
        this.arrows = [];
        this.eArrows = [];
        this.bArrows = [];
        this.wavefronts = [];
        this.phase = 0;
        this.axisY = 2.3;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Вісь поширення світлового променя OX (вектор Пойнтінга S)
        const axisGeo = new THREE.CylinderGeometry(0.03, 0.03, 11.2, 16);
        axisGeo.rotateZ(Math.PI / 2);
        const axisMesh = new THREE.Mesh(axisGeo, new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.5 }));
        axisMesh.position.set(0, this.axisY, 0);
        worldGroup.add(axisMesh);

        // Неперервні огинаючі криві для E(x,t) та B(x,t)
        this.eCurveGeo = new THREE.BufferGeometry();
        this.bCurveGeo = new THREE.BufferGeometry();
        this.eCurveLine = new THREE.Line(
          this.eCurveGeo,
          new THREE.LineBasicMaterial({ color: 0xb91c1c, linewidth: 2 })
        );
        this.bCurveLine = new THREE.Line(
          this.bCurveGeo,
          new THREE.LineBasicMaterial({ color: 0x1d4ed8, linewidth: 2 })
        );
        worldGroup.add(this.eCurveLine, this.bCurveLine);

        // Дискретні вектори полів E та B уздовж осі X
        const shaftGeo = new THREE.CylinderGeometry(0.024, 0.024, 1, 8);
        this.eMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.3 });
        this.bMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.3 });

        this.numSamples = 36;
        for (let i = 0; i < this.numSamples; i++) {
          const eMesh = new THREE.Mesh(shaftGeo, this.eMat);
          const bMesh = new THREE.Mesh(shaftGeo, this.bMat);
          worldGroup.add(eMesh, bMesh);
          this.eArrows.push(eMesh);
          this.bArrows.push(bMesh);
        }

        // Рухомі площини рівної фази (плоский світловий фронт E ⊥ B)
        const wfGeo = new THREE.PlaneGeometry(3.2, 3.2);
        wfGeo.rotateY(Math.PI / 2);
        const wfMat = new THREE.MeshPhysicalMaterial({
          color: 0x0284c7,
          transparent: true,
          opacity: 0.2,
          roughness: 0.15,
          side: THREE.DoubleSide
        });

        for (let i = 0; i < 4; i++) {
          const wf = new THREE.Mesh(wfGeo, wfMat);
          worldGroup.add(wf);
          this.wavefronts.push(wf);
        }

        this.mainEArrow = new SmartVectorArrow('E (електричне поле)', 0xb91c1c, '#b91c1c');
        this.mainBArrow = new SmartVectorArrow('B (магнітне поле)', 0x1d4ed8, '#1d4ed8');
        this.poyntingArrow = new SmartVectorArrow('S = [E × H] (фронт)', 0x166534, '#166534');
        this.arrows.push(this.mainEArrow, this.mainBArrow, this.poyntingArrow);
      }

      reset() {
        this.phase = 0;
        this.syncVisuals();
      }

      update(dt) {
        const p = sceneParams.emwave;
        const speed = 3.2 / Math.max(1.0, p.mediumN);
        this.phase = (this.phase + dt * speed) % (Math.PI * 200);
        if (uiState.simTime > 1.1) transitionToPhase('explain');
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.emwave;
        const lambdaEff = p.wavelength / Math.max(1.0, p.mediumN);
        const k = (2 * Math.PI) / Math.max(0.8, lambdaEff);
        const amp = p.ampE;
        const polPhase = p.ellipticity * (Math.PI / 2); // 0 = лінійна, 0..1 = еліптична, 1 = колова

        const ePoints = [];
        const bPoints = [];
        const numCurvePts = 140;

        for (let i = 0; i <= numCurvePts; i++) {
          const x = -5.2 + (i / numCurvePts) * 10.4;
          const arg = k * x - this.phase;
          const ey = amp * Math.sin(arg);
          const bz = amp * Math.sin(arg + polPhase);

          ePoints.push(new THREE.Vector3(x, this.axisY + ey, 0));
          bPoints.push(new THREE.Vector3(x, this.axisY, bz));
        }
        this.eCurveGeo.setFromPoints(ePoints);
        this.bCurveGeo.setFromPoints(bPoints);

        // Оновлюємо стовпчики векторів E та B
        for (let i = 0; i < this.numSamples; i++) {
          const x = -5.0 + (i / (this.numSamples - 1)) * 10.0;
          const arg = k * x - this.phase;
          const ey = amp * Math.sin(arg);
          const bz = amp * Math.sin(arg + polPhase);

          const eMesh = this.eArrows[i];
          const eLen = Math.max(0.02, Math.abs(ey));
          eMesh.scale.set(1, eLen, 1);
          eMesh.position.set(x, this.axisY + ey / 2, 0);

          const bMesh = this.bArrows[i];
          const bLen = Math.max(0.02, Math.abs(bz));
          bMesh.scale.set(1, bLen, 1);
          bMesh.rotation.x = Math.PI / 2;
          bMesh.position.set(x, this.axisY, bz / 2);
        }

        // Оновлюємо площини світлового фронту (рухаються зі швидкістю фази вздовж +X)
        const lambdaScene = (2 * Math.PI) / k;
        const shift = (this.phase / k) % lambdaScene;
        for (let i = 0; i < this.wavefronts.length; i++) {
          const wf = this.wavefronts[i];
          let xWf = -4.8 + i * lambdaScene + shift;
          while (xWf > 5.2) xWf -= lambdaScene * this.wavefronts.length;
          wf.position.set(xWf, this.axisY, 0);
          wf.visible = uiState.showParticles && xWf >= -5.2 && xWf <= 5.2;
        }

        // Головні підписані вектори E, B, S у центральній точці
        const ey0 = amp * Math.sin(-this.phase);
        const bz0 = amp * Math.sin(-this.phase + polPhase);
        const centerPt = new THREE.Vector3(0, this.axisY, 0);

        this.mainEArrow.update(
          centerPt,
          new THREE.Vector3(0, Math.sign(ey0 || 1), 0),
          Math.max(0.35, Math.abs(ey0)),
          uiState.showVectors,
          uiState.showLabels
        );
        this.mainBArrow.update(
          centerPt,
          new THREE.Vector3(0, 0, Math.sign(bz0 || 1)),
          Math.max(0.35, Math.abs(bz0)),
          uiState.showVectors,
          uiState.showLabels
        );
        this.poyntingArrow.update(
          new THREE.Vector3(5.2, this.axisY, 0),
          new THREE.Vector3(1, 0, 0),
          1.35,
          uiState.showVectors,
          uiState.showLabels
        );

        const wE = 0.5 * amp * amp * 25;
        const wB = 0.5 * amp * amp * 25;
        const polState = p.ellipticity === 0 ? 'Лінійна' : (p.ellipticity >= 0.95 ? 'Колова' : 'Еліптична');

        updateEnergyUI(wE, wB, 0, Math.max(wE + wB, 60), [
          { label: 'Довжина хвилі λ', val: `${lambdaScene.toFixed(2)} м` },
          { label: 'Поляризація', val: polState },
          { label: 'Фазова швидкість v', val: `${(300 / p.mediumN).toFixed(0)} тис. км/с` },
          { label: 'Вектор Пойнтінга S', val: `${(wE + wB).toFixed(1)} Вт/м²` }
        ]);
      }

      dispose() {
        this.arrows.forEach(a => a.dispose());
      }
    }

    // ============================================================================
    // 11I. СЦЕНА 13: РІВНЯННЯ БЕРНУЛЛІ ТА ЕФЕКТ ВЕНТУРІ (ГІДРОДИНАМІКА)
    // ============================================================================
    class BernoulliVenturiSimulation {
      constructor() {
        this.group = new THREE.Group();
        worldGroup.add(this.group);

        // Опорна лабораторна станина під трубою Вентурі
        const standGeo = new THREE.BoxGeometry(14.5, 0.28, 3.4);
        const standMat = new THREE.MeshStandardMaterial({ color: 0x5c4938, roughness: 0.72 });
        const stand = new THREE.Mesh(standGeo, standMat);
        stand.position.set(0, 0.14, 0);
        stand.receiveShadow = true;
        this.group.add(stand);

        // Латунні опори труби
        [-5.2, 5.2].forEach(xPos => {
          const pillar = new THREE.Mesh(
            new THREE.BoxGeometry(0.32, 1.85, 1.1),
            new THREE.MeshStandardMaterial({ color: 0x78716c, metalness: 0.6, roughness: 0.35 })
          );
          pillar.position.set(xPos, 1.05, 0);
          this.group.add(pillar);
        });

        this.pipeY = 2.05;
        this.pipeGroup = new THREE.Group();
        this.group.add(this.pipeGroup);

        // 3 п'єзометричні трубки (ліворуч у широкій, по центру у вузькій, праворуч у широкій)
        this.piezoPositions = [-4.2, 0, 4.2];
        this.piezoFluids = [];
        this.piezoMenisci = [];
        this.piezoTubes = [];

        const glassTubeMat = new THREE.MeshPhysicalMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.32,
          roughness: 0.1,
          depthWrite: false,
          side: THREE.FrontSide
        });
        const liquidMat = new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.22,
          roughness: 0.18,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
          side: THREE.FrontSide
        });

        this.piezoPositions.forEach(xPos => {
          // Скляна вертикальна трубка манометра
          const tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.16, 3.2, 20, 1, true),
            glassTubeMat
          );
          tube.renderOrder = 5;
          this.group.add(tube);
          this.piezoTubes.push(tube);

          // Стовпчик води всередині п'єзометра
          const fluidCol = new THREE.Mesh(
            new THREE.CylinderGeometry(0.135, 0.135, 1, 20),
            liquidMat
          );
          fluidCol.renderOrder = 2;
          this.group.add(fluidCol);
          this.piezoFluids.push(fluidCol);

          // Верхній меніск у п'єзометрі
          const meniscus = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, 0.04, 20),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
          );
          meniscus.renderOrder = 4;
          this.group.add(meniscus);
          this.piezoMenisci.push(meniscus);
        });

        // Частинки-маркери потоку рідини вздовж ліній течії
        this.particles = [];
        const partGeo = new THREE.SphereGeometry(0.085, 12, 12);
        const partMat = new THREE.MeshStandardMaterial({
          color: 0xe0f2fe,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.65,
          roughness: 0.2
        });

        for (let i = 0; i < 65; i++) {
          const mesh = new THREE.Mesh(partGeo, partMat);
          mesh.renderOrder = 3;
          this.group.add(mesh);
          const rFrac = 0.15 + 0.72 * Math.sqrt(((i * 17) % 65) / 65);
          const phi = i * 2.39996;
          this.particles.push({
            mesh,
            x: -6.2 + (i / 65) * 12.4,
            rFrac,
            phi
          });
        }

        // Лінії течії (streamlines)
        this.streamlinesGroup = new THREE.Group();
        this.group.add(this.streamlinesGroup);

        // Вектори швидкостей у широкому та вузькому перерізах
        this.arrowV1 = new SmartVectorArrow('v₁', 0x166534, '#166534');
        this.arrowV2 = new SmartVectorArrow('v₂', 0xbe123c, '#be123c');

        this.reset();
      }

      getRadiusAtX(x, r1, r2) {
        const ax = Math.abs(x);
        if (ax >= 3.0) return r1;
        if (ax <= 0.9) return r2;
        const t = (ax - 0.9) / (3.0 - 0.9);
        const smooth = 0.5 - 0.5 * Math.cos(Math.PI * t);
        return r2 + (r1 - r2) * smooth;
      }

      buildVenturiGeometry() {
        const p = sceneParams.bernoulli;
        const r1 = p.d1 * 0.42;
        const r2 = p.d2 * 0.42;

        clearGroup3D(this.pipeGroup);
        clearGroup3D(this.streamlinesGroup);

        const outerPts = [];
        const innerFluidPts = [];
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
          const x = -6.4 + (i / steps) * 12.8;
          const r = this.getRadiusAtX(x, r1, r2);
          outerPts.push(new THREE.Vector2(r, x));
          innerFluidPts.push(new THREE.Vector2(r * 0.94, x));
        }

        // Внутрішній об'єм води у трубі
        const fluidGeo = new THREE.LatheGeometry(innerFluidPts, 36);
        const fluidMat = new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.18,
          transparent: true,
          opacity: 0.42,
          roughness: 0.2,
          side: THREE.FrontSide,
          depthWrite: false
        });
        const fluidMesh = new THREE.Mesh(fluidGeo, fluidMat);
        fluidMesh.rotation.z = -Math.PI / 2;
        fluidMesh.position.set(0, this.pipeY, 0);
        fluidMesh.renderOrder = 1;
        this.pipeGroup.add(fluidMesh);

        // Зовнішня скляна оболонка труби Вентурі
        const glassGeo = new THREE.LatheGeometry(outerPts, 36);
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.28,
          roughness: 0.08,
          metalness: 0.05,
          side: THREE.FrontSide,
          depthWrite: false
        });
        const glassMesh = new THREE.Mesh(glassGeo, glassMat);
        glassMesh.rotation.z = -Math.PI / 2;
        glassMesh.position.set(0, this.pipeY, 0);
        glassMesh.renderOrder = 5;
        this.pipeGroup.add(glassMesh);

        // Латунні фланці на торцях і біля горловини
        const flangeMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.65, roughness: 0.3 });
        [-6.4, 0, 6.4].forEach(xPos => {
          const rad = this.getRadiusAtX(xPos, r1, r2);
          const torus = new THREE.Mesh(new THREE.TorusGeometry(rad + 0.04, 0.05, 14, 36), flangeMat);
          torus.rotation.y = Math.PI / 2;
          torus.position.set(xPos, this.pipeY, 0);
          this.pipeGroup.add(torus);
        });

        // Лінії течії (streamlines)
        const streamOffsets = [-0.65, -0.32, 0, 0.32, 0.65];
        const streamMat = new THREE.LineBasicMaterial({
          color: 0x7dd3fc,
          transparent: true,
          opacity: 0.55
        });
        streamOffsets.forEach(frac => {
          const pts = [];
          for (let i = 0; i <= 60; i++) {
            const x = -6.3 + (i / 60) * 12.6;
            const r = this.getRadiusAtX(x, r1, r2);
            pts.push(new THREE.Vector3(x, this.pipeY + frac * r * 0.85, 0));
          }
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), streamMat);
          line.renderOrder = 2;
          this.streamlinesGroup.add(line);
        });
      }

      syncVisuals() {
        this.buildVenturiGeometry();
        this.updateVisuals();
      }

      reset() {
        this.buildVenturiGeometry();
        this.phaseTriggered = false;
        this.updateVisuals();
      }

      update(dt) {
        const p = sceneParams.bernoulli;
        const r1 = p.d1 * 0.42;
        const r2 = p.d2 * 0.42;

        // Рух частинок зі швидкістю v(x) = v1 * (r1 / r(x))^2 за рівнянням нерозривності
        this.particles.forEach(pt => {
          const rLocal = this.getRadiusAtX(pt.x, r1, r2);
          const vLocal = p.v1 * Math.pow(r1 / Math.max(0.2, rLocal), 2);
          pt.x += vLocal * dt * 1.45;
          if (pt.x > 6.2) pt.x = -6.2 + (pt.x - 6.2);
        });

        if (uiState.simTime > 1.8 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }

        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.bernoulli;
        const r1 = p.d1 * 0.42;
        const r2 = p.d2 * 0.42;
        const areaRatio = Math.pow(p.d1 / p.d2, 2);
        const v2 = p.v1 * areaRatio;

        // Динамічний тиск у широкій та вузькій секціях (Па)
        const qDyn1 = 0.5 * p.rho * p.v1 * p.v1;
        const qDyn2 = 0.5 * p.rho * v2 * v2;
        const deltaP = Math.max(0, qDyn2 - qDyn1);

        const pStaticBase = 101300;
        const pStatic2 = Math.max(2000, pStaticBase - deltaP);

        this.streamlinesGroup.visible = uiState.showTrails;

        this.particles.forEach(pt => {
          pt.mesh.visible = uiState.showParticles;
          const rLocal = this.getRadiusAtX(pt.x, r1, r2);
          const rad = pt.rFrac * rLocal * 0.85;
          pt.mesh.position.set(
            pt.x,
            this.pipeY + rad * Math.cos(pt.phi),
            rad * Math.sin(pt.phi)
          );
        });

        const h1 = 2.35;
        const dropH = Math.min(1.95, (deltaP / 28000) * 1.85);
        const h2 = Math.max(0.32, h1 - dropH);
        const heights = [h1, h2, h1 - 0.08];

        this.piezoPositions.forEach((xPos, idx) => {
          const rPipe = this.getRadiusAtX(xPos, r1, r2);
          const baseTop = this.pipeY + rPipe * 0.88;
          const tubeH = 2.7;

          this.piezoTubes[idx].position.set(xPos, baseTop + tubeH / 2, 0);
          const colH = heights[idx];
          this.piezoFluids[idx].scale.set(1, colH, 1);
          this.piezoFluids[idx].position.set(xPos, baseTop + colH / 2, 0);
          this.piezoMenisci[idx].position.set(xPos, baseTop + colH + 0.02, 0);
        });

        this.arrowV1.update(
          new THREE.Vector3(-4.6, this.pipeY, r1 + 0.35),
          new THREE.Vector3(1, 0, 0),
          Math.min(2.5, 0.45 + p.v1 * 0.45),
          uiState.showVectors,
          uiState.showLabels
        );
        this.arrowV2.update(
          new THREE.Vector3(-0.6, this.pipeY, r2 + 0.35),
          new THREE.Vector3(1, 0, 0),
          Math.min(3.4, 0.45 + v2 * 0.25),
          uiState.showVectors,
          uiState.showLabels
        );

        updateEnergyUI(qDyn2 / 1000, pStatic2 / 1000, 0, 110, [
          { label: 'Швидкість у горловині v₂', val: `${v2.toFixed(2)} м/с` },
          { label: 'Відношення площ A₁/A₂', val: `${areaRatio.toFixed(2)}×` },
          { label: 'Динамічний тиск ½ρv₂²', val: `${(qDyn2 / 1000).toFixed(2)} кПа` },
          { label: 'Падіння тиску Δp = p₁−p₂', val: `${(deltaP / 1000).toFixed(2)} кПа` }
        ]);
      }

      dispose() {
        this.arrowV1.dispose();
        this.arrowV2.dispose();
      }
    }

    // ============================================================================
    // 11J. СЦЕНА 14: ЗБИРАЛЬНА ЛІНЗА ТА ФОКУСУВАННЯ СВІТЛОВОГО ФРОНТУ
    // ============================================================================
    class ConvergingLensWavefrontSimulation {
      constructor() {
        this.group = new THREE.Group();
        worldGroup.add(this.group);

        this.axisY = 2.6;
        this.lensX = -1.6;

        // Оптична лава
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(15.6, 0.24, 2.2),
          new THREE.MeshStandardMaterial({ color: 0x5c4938, roughness: 0.72 })
        );
        rail.position.set(0, 0.12, 0);
        rail.receiveShadow = true;
        this.group.add(rail);

        // Головна оптична вісь
        const axisPts = [new THREE.Vector3(-7.5, this.axisY, 0), new THREE.Vector3(7.5, this.axisY, 0)];
        const axisLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(axisPts),
          new THREE.LineBasicMaterial({ color: 0x78716c, transparent: true, opacity: 0.55 })
        );
        this.group.add(axisLine);

        // Оправа та двоопукла скляна лінза
        this.lensSupport = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.22, this.axisY - 0.2, 16),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.7, roughness: 0.3 })
        );
        this.lensSupport.position.set(this.lensX, (this.axisY - 0.2) / 2, 0);
        this.group.add(this.lensSupport);

        this.lensRim = new THREE.Mesh(
          new THREE.TorusGeometry(2.15, 0.08, 16, 48),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.75, roughness: 0.28 })
        );
        this.lensRim.rotation.y = Math.PI / 2;
        this.lensRim.position.set(this.lensX, this.axisY, 0);
        this.group.add(this.lensRim);

        // Скляне тіло двоопуклої лінзи
        const lensGeo = new THREE.SphereGeometry(2.12, 36, 36);
        const lensMat = new THREE.MeshPhysicalMaterial({
          color: 0xbae6fd,
          transparent: true,
          opacity: 0.46,
          roughness: 0.06,
          metalness: 0.05,
          depthWrite: false
        });
        this.lensMesh = new THREE.Mesh(lensGeo, lensMat);
        this.lensMesh.position.set(this.lensX, this.axisY, 0);
        this.lensMesh.renderOrder = 5;
        this.group.add(this.lensMesh);

        // Точка головного фокуса F'
        this.focusMarker = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 24, 24),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        this.group.add(this.focusMarker);

        this.focusStand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.08, this.axisY, 12),
          new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 })
        );
        this.group.add(this.focusStand);

        this.raysGroup = new THREE.Group();
        this.group.add(this.raysGroup);

        this.wavefrontsGroup = new THREE.Group();
        this.group.add(this.wavefrontsGroup);

        this.arrowFocus = new SmartVectorArrow('f', 0xb45309, '#b45309');

        this.reset();
      }

      wavelengthToHex(nm) {
        if (nm < 450) return 0x6366f1;
        if (nm < 495) return 0x0ea5e9;
        if (nm < 555) return 0x10b981;
        if (nm < 590) return 0xeab308;
        if (nm < 635) return 0xf97316;
        return 0xef4444;
      }

      syncVisuals() {
        this.updateVisuals();
      }

      reset() {
        this.phaseTriggered = false;
        this.updateVisuals();
      }

      update(dt) {
        if (uiState.simTime > 1.8 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.lens;
        const f = p.radiusR / (2 * (p.glassN - 1));
        const optPowerD = 1 / f;
        const focusX = this.lensX + f;
        const beamColor = this.wavelengthToHex(p.wavelength);

        const thicknessScale = Math.max(0.14, Math.min(0.38, 0.85 / p.radiusR));
        this.lensMesh.scale.set(thicknessScale, 1, 1);

        this.focusMarker.position.set(focusX, this.axisY, 0);
        this.focusStand.position.set(focusX, this.axisY / 2, 0);

        this.arrowFocus.update(
          new THREE.Vector3(this.lensX, 0.55, 1.25),
          new THREE.Vector3(1, 0, 0),
          Math.min(6.5, f),
          uiState.showVectors,
          uiState.showLabels
        );

        this.raysGroup.visible = uiState.showTrails;
        this.wavefrontsGroup.visible = uiState.showParticles;

        clearGroup3D(this.raysGroup);

        const rayMat = new THREE.LineBasicMaterial({
          color: beamColor,
          transparent: true,
          opacity: 0.85
        });

        const numRays = 7;
        for (let i = 0; i < numRays; i++) {
          const frac = (i / (numRays - 1)) * 2 - 1;
          const yOffset = frac * p.beamAperture;
          const yStart = this.axisY + yOffset;

          const slope = -yOffset / f;
          const xEnd = 7.2;
          const yEnd = this.axisY + yOffset + slope * (xEnd - this.lensX);

          const pts = [
            new THREE.Vector3(-7.2, yStart, 0),
            new THREE.Vector3(this.lensX, yStart, 0),
            new THREE.Vector3(xEnd, yEnd, 0)
          ];
          const rayLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), rayMat);
          this.raysGroup.add(rayLine);
        }

        clearGroup3D(this.wavefrontsGroup);

        const wfMat = new THREE.LineBasicMaterial({
          color: 0x0284c7,
          transparent: true,
          opacity: 0.9
        });

        const spacing = 0.95;
        const phaseShift = (uiState.simTime * 2.4) % spacing;

        for (let xBase = -7.0 + phaseShift; xBase <= 6.8; xBase += spacing) {
          const pts = [];
          const segs = 28;

          if (xBase <= this.lensX) {
            for (let j = 0; j <= segs; j++) {
              const u = (j / segs) * 2 - 1;
              pts.push(new THREE.Vector3(xBase, this.axisY + u * p.beamAperture, 0));
            }
          } else {
            const distFromLens = xBase - this.lensX;
            const rho = f - distFromLens;
            const maxAngle = Math.atan2(p.beamAperture, f);

            for (let j = 0; j <= segs; j++) {
              const u = (j / segs) * 2 - 1;
              const theta = u * maxAngle;
              const wx = focusX - rho * Math.cos(theta);
              const wy = this.axisY + rho * Math.sin(theta);
              pts.push(new THREE.Vector3(wx, wy, 0));
            }
          }

          const wfLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wfMat);
          this.wavefrontsGroup.add(wfLine);
        }

        const focusIntensity = Math.min(50, optPowerD * p.beamAperture * 18);
        const centerDelayNm = (p.glassN - 1) * 240;

        updateEnergyUI(focusIntensity, optPowerD * 10, centerDelayNm / 10, 50, [
          { label: 'Фокусна відстань f', val: `${f.toFixed(2)} м` },
          { label: 'Оптична сила лінзи D', val: `${optPowerD.toFixed(2)} дптр` },
          { label: 'Показник заломлення n', val: `${p.glassN.toFixed(2)}` },
          { label: 'Кут збіжності 2θ', val: `${((2 * Math.atan2(p.beamAperture, f) * 180) / Math.PI).toFixed(1)}°` }
        ]);
      }

      dispose() {
        this.arrowFocus.dispose();
      }
    }

    // ============================================================================
    // 11K. СЦЕНА 15: СИЛА ЛОРЕНЦА — СПІРАЛЬНИЙ РУХ ЗАРЯДУ В МАГНІТНОМУ ПОЛІ
    // ============================================================================
    class LorentzForceSimulation {
      constructor() {
        this.group = new THREE.Group();
        worldGroup.add(this.group);

        const coilMat = new THREE.MeshStandardMaterial({
          color: 0xb45309,
          metalness: 0.65,
          roughness: 0.3
        });

        [0.35, 5.25].forEach(yPos => {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.18, 20, 64), coilMat);
          coil.rotation.x = Math.PI / 2;
          coil.position.set(0, yPos, 0);
          coil.castShadow = true;
          this.group.add(coil);
        });

        const bLineMat = new THREE.LineBasicMaterial({
          color: 0x3b82f6,
          transparent: true,
          opacity: 0.32
        });
        const coneGeo = new THREE.ConeGeometry(0.08, 0.24, 12);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.55 });

        [-1.8, 0, 1.8].forEach(gx => {
          [-1.8, 0, 1.8].forEach(gz => {
            const pts = [new THREE.Vector3(gx, 0.35, gz), new THREE.Vector3(gx, 5.25, gz)];
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), bLineMat);
            this.group.add(line);

            const arrowTip = new THREE.Mesh(coneGeo, coneMat);
            arrowTip.position.set(gx, 4.6, gz);
            this.group.add(arrowTip);
          });
        });

        this.guideHelixGroup = new THREE.Group();
        this.group.add(this.guideHelixGroup);

        this.trailPoints = [];
        this.trailGeo = new THREE.BufferGeometry();
        this.trailLine = new THREE.Line(
          this.trailGeo,
          new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 })
        );
        this.group.add(this.trailLine);

        const partGeo = new THREE.SphereGeometry(0.24, 28, 28);
        const partMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x059669,
          emissiveIntensity: 0.45,
          roughness: 0.2,
          metalness: 0.2
        });
        this.particle = new THREE.Mesh(partGeo, partMat);
        this.particle.castShadow = true;
        this.group.add(this.particle);

        this.arrowFL = new SmartVectorArrow('F_L', 0xbe123c, '#be123c');
        this.arrowV = new SmartVectorArrow('v', 0x166534, '#166534');
        this.arrowB = new SmartVectorArrow('B', 0x1d4ed8, '#1d4ed8');

        this.reset();
      }

      buildGuideHelix() {
        clearGroup3D(this.guideHelixGroup);

        const p = sceneParams.lorentz;
        const alpha = (p.pitchAngle * Math.PI) / 180;
        const vPerp = p.v0 * Math.sin(alpha);
        const vPar = p.v0 * Math.cos(alpha);
        const omegaC = p.qOverM * p.fieldB;
        const radiusR = vPerp / Math.max(0.1, omegaC);

        const pts = [];
        const maxPhi = Math.PI * 6;
        for (let i = 0; i <= 180; i++) {
          const phi = (i / 180) * maxPhi;
          const t = phi / Math.max(0.1, omegaC);
          const x = radiusR * Math.cos(phi);
          const z = radiusR * Math.sin(phi);
          const y = 0.65 + vPar * t * 0.42;
          if (y > 4.75) break;
          pts.push(new THREE.Vector3(x, y, z));
        }

        const guideLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x78716c, transparent: true, opacity: 0.35 })
        );
        this.guideHelixGroup.add(guideLine);
      }

      syncVisuals() {
        this.buildGuideHelix();
        this.updateVisuals();
      }

      reset() {
        this.phaseTriggered = false;
        this.trailPoints = [];
        this.buildGuideHelix();
        this.updateVisuals();
      }

      update(dt) {
        if (uiState.simTime > 1.8 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.lorentz;
        const alpha = (p.pitchAngle * Math.PI) / 180;
        const vPerp = p.v0 * Math.sin(alpha);
        const vPar = p.v0 * Math.cos(alpha);
        const omegaC = p.qOverM * p.fieldB;
        const radiusR = vPerp / Math.max(0.1, omegaC);
        const periodT = (2 * Math.PI) / Math.max(0.1, omegaC);
        const pitchH = vPar * periodT;

        const t = uiState.simTime * 1.15;
        const phi = omegaC * t;

        const x = radiusR * Math.cos(phi);
        const z = radiusR * Math.sin(phi);
        const ySpan = 4.1;
        const rawY = vPar * t * 0.42;
        const y = 0.65 + (rawY % ySpan);

        if (this.trailPoints.length > 0 && y < this.trailPoints[this.trailPoints.length - 1].y - 1.5) {
          this.trailPoints = [];
        }

        const pos = new THREE.Vector3(x, y, z);
        this.particle.position.copy(pos);

        if (uiState.running) {
          this.trailPoints.push(pos.clone());
          if (this.trailPoints.length > 140) this.trailPoints.shift();
        } else if (this.trailPoints.length === 0) {
          this.trailPoints.push(pos.clone());
        }
        this.trailGeo.setFromPoints(this.trailPoints);

        this.guideHelixGroup.visible = uiState.showTrails;
        this.trailLine.visible = uiState.showTrails;

        const vDir = new THREE.Vector3(-vPerp * Math.sin(phi), vPar * 0.42, vPerp * Math.cos(phi)).normalize();
        const flDir = new THREE.Vector3(-Math.cos(phi), 0, -Math.sin(phi)).normalize();
        const forceMag = p.qOverM * vPerp * p.fieldB;

        this.arrowV.update(pos, vDir, Math.min(2.2, 0.5 + p.v0 * 0.28), uiState.showVectors, uiState.showLabels);
        this.arrowFL.update(pos, flDir, Math.min(2.4, 0.45 + forceMag * 0.14), uiState.showVectors, uiState.showLabels);
        this.arrowB.update(pos, new THREE.Vector3(0, 1, 0), 1.35, uiState.showVectors, uiState.showLabels);

        const ekPerp = 0.5 * vPerp * vPerp;
        const ekPar = 0.5 * vPar * vPar;

        updateEnergyUI(ekPerp, ekPar, 0, 18, [
          { label: 'Радіус спіралі R', val: `${radiusR.toFixed(2)} м` },
          { label: 'Крок гвинта h', val: `${pitchH.toFixed(2)} м` },
          { label: 'Циклотронна частота ω_c', val: `${omegaC.toFixed(2)} рад/с` },
          { label: 'Робота сили Лоренца A', val: '0.00 Дж (F_L ⊥ v)' }
        ]);
      }

      dispose() {
        this.arrowFL.dispose();
        this.arrowV.dispose();
        this.arrowB.dispose();
      }
    }

    // ============================================================================
    // 11L. СЦЕНА 16: ЕЛЕКТРОМАГНІТНА ІНДУКЦІЯ ФАРАДЕЯ — ЛЕНЦА
    // ============================================================================
    class FaradayInductionSimulation {
      constructor() {
        this.group = new THREE.Group();
        worldGroup.add(this.group);

        this.axisY = 2.4;

        const base = new THREE.Mesh(
          new THREE.BoxGeometry(14.5, 0.28, 4.4),
          new THREE.MeshStandardMaterial({ color: 0x5c4938, roughness: 0.72 })
        );
        base.position.set(0, 0.14, 0);
        base.receiveShadow = true;
        this.group.add(base);

        this.coilGroup = new THREE.Group();
        this.group.add(this.coilGroup);

        this.electrons = [];
        const elGeo = new THREE.SphereGeometry(0.095, 12, 12);
        const elMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        for (let i = 0; i < 28; i++) {
          const el = new THREE.Mesh(elGeo, elMat);
          this.group.add(el);
          this.electrons.push({ mesh: el, s: i / 28 });
        }

        const meterBox = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 2.1, 0.9),
          new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.5 })
        );
        meterBox.position.set(0, 1.35, -2.1);
        meterBox.castShadow = true;
        this.group.add(meterBox);

        const dialFace = new THREE.Mesh(
          new THREE.PlaneGeometry(1.8, 1.3),
          new THREE.MeshBasicMaterial({ color: 0xfefce8 })
        );
        dialFace.position.set(0, 1.5, -1.64);
        this.group.add(dialFace);

        this.needlePivot = new THREE.Group();
        this.needlePivot.position.set(0, 1.05, -1.61);
        const needleMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.95, 0.02),
          new THREE.MeshBasicMaterial({ color: 0xbe123c })
        );
        needleMesh.position.set(0, 0.45, 0);
        this.needlePivot.add(needleMesh);
        this.group.add(this.needlePivot);

        this.bulbMat = new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.1,
          transparent: true,
          opacity: 0.85
        });
        this.bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 20), this.bulbMat);
        this.bulbMesh.position.set(0, 2.65, -2.1);
        this.group.add(this.bulbMesh);

        this.magnetGroup = new THREE.Group();
        this.group.add(this.magnetGroup);

        const northHalf = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.72, 0.72),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.2 })
        );
        northHalf.position.set(0.8, 0, 0);
        northHalf.castShadow = true;
        this.magnetGroup.add(northHalf);

        const southHalf = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.72, 0.72),
          new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.2 })
        );
        southHalf.position.set(-0.8, 0, 0);
        southHalf.castShadow = true;
        this.magnetGroup.add(southHalf);

        this.fluxLinesGroup = new THREE.Group();
        this.magnetGroup.add(this.fluxLinesGroup);
        const fluxLineMat = new THREE.LineBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.55
        });
        [1.1, 1.75, -1.1, -1.75].forEach(loopHeight => {
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(1.5, 0, 0),
            new THREE.Vector3(2.3, loopHeight * 0.65, 0),
            new THREE.Vector3(0, loopHeight, 0),
            new THREE.Vector3(-2.3, loopHeight * 0.65, 0),
            new THREE.Vector3(-1.5, 0, 0)
          ]);
          const pts = curve.getPoints(48);
          this.fluxLinesGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fluxLineMat));
        });

        this.arrowMagnetV = new SmartVectorArrow('v_m', 0x166534, '#166534');
        this.arrowBInd = new SmartVectorArrow('B_ind', 0xbe123c, '#be123c');

        this.reset();
      }

      buildCoilGeometry() {
        clearGroup3D(this.coilGroup);

        const p = sceneParams.faraday;
        const turns = p.turnsN;
        const rad = p.coilR * 0.75;
        const coilLen = 3.2;

        const helixPts = [];
        const totalSegs = turns * 24;
        for (let i = 0; i <= totalSegs; i++) {
          const u = i / totalSegs;
          const angle = u * turns * Math.PI * 2;
          const x = (u - 0.5) * coilLen;
          const y = this.axisY + rad * Math.cos(angle);
          const z = rad * Math.sin(angle);
          helixPts.push(new THREE.Vector3(x, y, z));
        }

        this.helixCurve = new THREE.CatmullRomCurve3(helixPts);
        const tubeGeo = new THREE.TubeGeometry(this.helixCurve, totalSegs, 0.055, 10, false);
        const copperMat = new THREE.MeshStandardMaterial({
          color: 0xd97706,
          metalness: 0.78,
          roughness: 0.25
        });
        const coilMesh = new THREE.Mesh(tubeGeo, copperMat);
        coilMesh.castShadow = true;
        this.coilGroup.add(coilMesh);
      }

      syncVisuals() {
        this.buildCoilGeometry();
        this.updateVisuals();
      }

      reset() {
        this.phaseTriggered = false;
        this.buildCoilGeometry();
        this.updateVisuals();
      }

      update(dt) {
        if (uiState.simTime > 1.8 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.faraday;
        const omega = p.freq;
        const t = uiState.simTime;

        const ampX = 3.1;
        const magX = -ampX * Math.cos(omega * t);
        const magVx = ampX * omega * Math.sin(omega * t);

        this.magnetGroup.position.set(magX, this.axisY, 0);

        const area = Math.PI * p.coilR * p.coilR * 0.01;
        const gaussianEnv = Math.exp(-(magX * magX) / 4.5);
        const fluxPhi = p.magnetB * area * gaussianEnv;

        const dPhiDt = fluxPhi * ((-2 * magX) / 4.5) * magVx;
        const emf = -p.turnsN * dPhiDt * 18;

        const maxAngle = 0.85;
        this.needlePivot.rotation.z = Math.max(-maxAngle, Math.min(maxAngle, -emf * 0.18));
        this.bulbMat.emissiveIntensity = Math.min(2.5, 0.08 + Math.abs(emf) * 0.45);

        if (this.fluxLinesGroup) {
          this.fluxLinesGroup.visible = uiState.showTrails;
        }

        if (this.helixCurve) {
          const shift = (uiState.simTime * emf * 0.04) % 1;
          this.electrons.forEach(el => {
            el.mesh.visible = uiState.showParticles;
            let u = (el.s + shift) % 1;
            if (u < 0) u += 1;
            const pt = this.helixCurve.getPoint(u);
            el.mesh.position.copy(pt);
          });
        }

        this.arrowMagnetV.update(
          new THREE.Vector3(magX, this.axisY + 0.65, 0),
          new THREE.Vector3(magVx >= 0 ? 1 : -1, 0, 0),
          Math.min(2.4, Math.abs(magVx) * 0.25),
          uiState.showVectors,
          uiState.showLabels
        );

        const bIndDir = dPhiDt >= 0 ? -1 : 1;
        this.arrowBInd.update(
          new THREE.Vector3(0, this.axisY, 0),
          new THREE.Vector3(bIndDir, 0, 0),
          Math.min(2.5, Math.abs(emf) * 0.35),
          uiState.showVectors,
          uiState.showLabels
        );

        const maxEmf = p.turnsN * p.magnetB * omega * 0.18;
        const iMax = maxEmf / p.coilR;
        const elPower = (emf * emf) / p.coilR;
        const magEnergy = fluxPhi * p.turnsN * 12;

        updateEnergyUI(elPower, magEnergy, 0, 15, [
          { label: 'Макс. струм I_max = ℰ/R', val: `${iMax.toFixed(2)} А (${maxEmf.toFixed(2)} В)` },
          { label: 'Миттєва ЕРС |ℰᵢ|', val: `${Math.abs(emf).toFixed(2)} В` },
          { label: 'Швидкість магніту v', val: `${magVx.toFixed(2)} м/с` },
          { label: 'Правило Ленца', val: Math.abs(magVx) < 0.08 ? 'v = 0 → ℰᵢ = 0' : (dPhiDt > 0 ? 'Протидіє росту Φ' : 'Підтримує спад Φ') }
        ]);
      }

      dispose() {
        this.arrowMagnetV.dispose();
        this.arrowBInd.dispose();
      }
    }

    // ============================================================================
    // 11g. МОДУЛЬ § 17: ЗАКОНИ КЕПЛЕРА ТА ГРАВІТАЦІЙНА ОРБІТА
    // ============================================================================
    class KeplerOrbitSimulation {
      constructor() {
        this.planeY = 2.0;
        this.theta = 0;
        this.phaseTriggered = false;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Ступінчастий латунно-кам'яний п'єдестал астрономічного оррарія
        const basePedestal = new THREE.Group();
        const lowerBase = new THREE.Mesh(
          new THREE.CylinderGeometry(1.35, 1.55, 0.28, 32),
          new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.65, metalness: 0.3 })
        );
        lowerBase.position.set(0, 0.14, 0);
        lowerBase.receiveShadow = true;
        basePedestal.add(lowerBase);

        const brassCollar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.68, 0.85, 0.22, 32),
          new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.3, metalness: 0.72 })
        );
        brassCollar.position.set(0, 0.35, 0);
        basePedestal.add(brassCollar);

        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.42, this.planeY - 0.3, 24),
          new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.5, metalness: 0.45 })
        );
        pillar.position.set(0, (this.planeY - 0.3) / 2 + 0.2, 0);
        pillar.castShadow = true;
        basePedestal.add(pillar);

        // Екліптичне градуйоване кільце-лімб навколо центральної осі
        const eclipticRing = new THREE.Mesh(
          new THREE.TorusGeometry(2.2, 0.045, 12, 64),
          new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.4, metalness: 0.6 })
        );
        eclipticRing.rotation.x = Math.PI / 2;
        eclipticRing.position.set(0, 0.32, 0);
        basePedestal.add(eclipticRing);
        worldGroup.add(basePedestal);

        // Центральна зоря (Сонце) у головному фокусі еліпса F₁ (0, planeY, 0)
        this.starMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.62, 32, 32),
          new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0xd97706,
            emissiveIntensity: 0.9,
            roughness: 0.22
          })
        );
        this.starMesh.position.set(0, this.planeY, 0);
        this.starMesh.castShadow = true;
        worldGroup.add(this.starMesh);

        // Двошарова корона зорі + екваторіальне сонячне кільце
        this.starHalo = new THREE.Mesh(
          new THREE.SphereGeometry(0.86, 24, 24),
          new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.24 })
        );
        this.starHalo.position.set(0, this.planeY, 0);
        worldGroup.add(this.starHalo);

        // Другий (порожній) фокус еліпса F₂ на латунній штанзі
        this.emptyFocusGroup = new THREE.Group();
        const focusMarker = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 18, 18),
          new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.3, metalness: 0.7 })
        );
        this.emptyFocusGroup.add(focusMarker);
        const focusRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.24, 0.025, 10, 28),
          new THREE.MeshStandardMaterial({ color: 0x78716c, metalness: 0.5 })
        );
        focusRing.rotation.x = Math.PI / 2;
        this.emptyFocusGroup.add(focusRing);
        worldGroup.add(this.emptyFocusGroup);

        // Маркери перигелію P та афелію A
        const markerGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.36, 14);
        this.periMarker = new THREE.Mesh(
          markerGeo,
          new THREE.MeshStandardMaterial({ color: 0x16a34a, metalness: 0.5, roughness: 0.3 })
        );
        this.apheMarker = new THREE.Mesh(
          markerGeo,
          new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.5, roughness: 0.3 })
        );
        worldGroup.add(this.periMarker);
        worldGroup.add(this.apheMarker);

        // Планета з нахиленою віссю, системою кілець та супутником
        this.planetGroup = new THREE.Group();
        const planetMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.34, 32, 32),
          new THREE.MeshPhysicalMaterial({ color: 0x1d4ed8, roughness: 0.25, metalness: 0.15, clearcoat: 0.55 })
        );
        planetMesh.castShadow = true;
        this.planetGroup.add(planetMesh);

        const eqBand = new THREE.Mesh(
          new THREE.TorusGeometry(0.345, 0.022, 12, 36),
          new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.3 })
        );
        eqBand.rotation.x = Math.PI / 2;
        this.planetGroup.add(eqBand);

        const eqRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.52, 0.032, 12, 42),
          new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.35, metalness: 0.25 })
        );
        eqRing.rotation.x = Math.PI * 0.42;
        this.planetGroup.add(eqRing);

        // Вісь обертання планети
        const axisRod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 0.92, 10),
          new THREE.MeshStandardMaterial({ color: 0xfef08a, metalness: 0.6 })
        );
        axisRod.rotation.z = 0.22;
        this.planetGroup.add(axisRod);

        // Природний супутник планети
        this.moonPivot = new THREE.Group();
        const moonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.085, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.6 })
        );
        moonMesh.position.set(0.76, 0.08, 0);
        this.moonPivot.add(moonMesh);
        this.planetGroup.add(this.moonPivot);

        worldGroup.add(this.planetGroup);

        // Група орбітальної колії, осей еліпса та еталонного сектора ІІ закону Кеплера
        this.orbitGuideGroup = new THREE.Group();
        worldGroup.add(this.orbitGuideGroup);
        this.radiusLine = null;
        this.sectorMesh = null;

        this.arrowVel = new SmartVectorArrow('v (орбітальна)', 0x166534, '#166534');
        this.arrowGrav = new SmartVectorArrow('F_g (тяжіння)', 0xb91c1c, '#b91c1c');
      }

      rebuildOrbitCurve() {
        clearGroup3D(this.orbitGuideGroup);
        const p = sceneParams.kepler;
        const a = p.semiMajorA;
        const e = p.eccentricity;
        const b = a * Math.sqrt(Math.max(0.01, 1 - e * e));
        const cFocus = a * e;
        const pts = [];
        for (let i = 0; i <= 128; i++) {
          const ang = (i / 128) * Math.PI * 2;
          const r = (a * (1 - e * e)) / (1 + e * Math.cos(ang));
          pts.push(new THREE.Vector3(r * Math.cos(ang), this.planeY, -r * Math.sin(ang)));
        }

        // Об'ємна латунна орбітальна рейка-колія
        const orbitCurve = new THREE.CatmullRomCurve3(pts, true);
        const railMesh = new THREE.Mesh(
          new THREE.TubeGeometry(orbitCurve, 128, 0.028, 10, true),
          new THREE.MeshStandardMaterial({
            color: 0x1e3a5f,
            metalness: 0.55,
            roughness: 0.35,
            transparent: true,
            opacity: 0.78
          })
        );
        this.orbitGuideGroup.add(railMesh);

        // Велика (2a) та мала (2b) осі еліпса
        const rPeri = a * (1 - e);
        const rAphe = a * (1 + e);
        const majorAxis = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-rAphe, this.planeY - 0.03, 0),
            new THREE.Vector3(rPeri, this.planeY - 0.03, 0)
          ]),
          new THREE.LineBasicMaterial({ color: 0x78716c, transparent: true, opacity: 0.45 })
        );
        const minorAxis = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-cFocus, this.planeY - 0.03, -b),
            new THREE.Vector3(-cFocus, this.planeY - 0.03, b)
          ]),
          new THREE.LineBasicMaterial({ color: 0x78716c, transparent: true, opacity: 0.45 })
        );
        this.orbitGuideGroup.add(majorAxis);
        this.orbitGuideGroup.add(minorAxis);

        // Еталонний сектор поблизу афелію для порівняння площ за ІІ законом Кеплера
        const mu = 12.0 * p.starMass;
        const pSemi = a * (1 - e * e);
        const hAng = Math.sqrt(mu * pSemi);
        const sweepAphe = Math.min(0.85, (hAng * 0.45) / (rAphe * rAphe));
        const refVerts = [0, this.planeY - 0.025, 0];
        const steps = 14;
        for (let i = 0; i <= steps; i++) {
          const ang = Math.PI - sweepAphe * 0.5 + (i / steps) * sweepAphe;
          const ri = pSemi / (1 + e * Math.cos(ang));
          refVerts.push(ri * Math.cos(ang), this.planeY - 0.025, -ri * Math.sin(ang));
        }
        const refIdx = [];
        for (let i = 1; i <= steps; i++) refIdx.push(0, i, i + 1);
        const refGeo = new THREE.BufferGeometry();
        refGeo.setAttribute('position', new THREE.Float32BufferAttribute(refVerts, 3));
        refGeo.setIndex(refIdx);
        const refSector = new THREE.Mesh(
          refGeo,
          new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
        );
        this.orbitGuideGroup.add(refSector);

        this.orbitGuideGroup.visible = uiState.showTrails;

        // Позиція другого фокуса: x = -2ae, а також маркерів перигелію та афелію
        this.emptyFocusGroup.position.set(-2 * a * e, this.planeY, 0);
        this.emptyFocusGroup.visible = uiState.showTrails;

        this.periMarker.position.set(rPeri, this.planeY - 0.18, 0);
        this.apheMarker.position.set(-rAphe, this.planeY - 0.18, 0);
        this.periMarker.visible = uiState.showTrails;
        this.apheMarker.visible = uiState.showTrails;

        const sScale = 0.8 + p.starMass * 0.16;
        this.starMesh.scale.setScalar(sScale);
        this.starHalo.scale.setScalar(sScale * 1.05);
      }

      syncVisuals() {
        this.rebuildOrbitCurve();
        this.updateVisuals();
      }

      reset() {
        this.theta = 0;
        this.phaseTriggered = false;
        this.rebuildOrbitCurve();
        this.updateVisuals();
      }

      update(dt) {
        const p = sceneParams.kepler;
        const a = p.semiMajorA;
        const e = p.eccentricity;
        const r = (a * (1 - e * e)) / (1 + e * Math.cos(this.theta));
        // ІІ закон Кеплера: dθ/dt = L / (m r²)
        const hAngular = Math.sqrt(12.0 * p.starMass * a * (1 - e * e));
        const dTheta = (hAngular / (r * r)) * dt;
        this.theta = (this.theta + dTheta) % (Math.PI * 2);

        if (uiState.simTime > 1.8 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.kepler;
        const a = p.semiMajorA;
        const e = p.eccentricity;
        const mu = 12.0 * p.starMass;
        const pSemi = a * (1 - e * e);
        const r = pSemi / (1 + e * Math.cos(this.theta));

        const px = r * Math.cos(this.theta);
        const pz = -r * Math.sin(this.theta);
        const planetPos = new THREE.Vector3(px, this.planeY, pz);
        this.planetGroup.position.copy(planetPos);
        const pScale = 0.82 + p.planetMass * 0.14;
        this.planetGroup.scale.setScalar(pScale);
        this.moonPivot.rotation.y = uiState.simTime * 3.2;

        this.orbitGuideGroup.visible = uiState.showTrails;
        this.emptyFocusGroup.visible = uiState.showTrails;
        this.periMarker.visible = uiState.showTrails;
        this.apheMarker.visible = uiState.showTrails;

        // Сектор ІІ закону Кеплера (рівна площа за фіксований інтервал Δt)
        if (this.sectorMesh) {
          disposeObject3D(this.sectorMesh);
          this.sectorMesh = null;
        }
        if (this.radiusLine) {
          disposeObject3D(this.radiusLine);
          this.radiusLine = null;
        }

        const radGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, this.planeY, 0),
          planetPos
        ]);
        this.radiusLine = new THREE.Line(
          radGeo,
          new THREE.LineBasicMaterial({ color: 0xb45309, transparent: true, opacity: 0.8 })
        );
        this.radiusLine.visible = uiState.showTrails;
        worldGroup.add(this.radiusLine);

        if (uiState.showParticles) {
          const hAng = Math.sqrt(mu * pSemi);
          const sweepSpan = Math.min(0.9, (hAng * 0.45) / (r * r));
          const verts = [0, this.planeY - 0.02, 0];
          const steps = 16;
          for (let i = 0; i <= steps; i++) {
            const ang = this.theta - (i / steps) * sweepSpan;
            const ri = pSemi / (1 + e * Math.cos(ang));
            verts.push(ri * Math.cos(ang), this.planeY - 0.02, -ri * Math.sin(ang));
          }
          const indices = [];
          for (let i = 1; i <= steps; i++) {
            indices.push(0, i, i + 1);
          }
          const secGeo = new THREE.BufferGeometry();
          secGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
          secGeo.setIndex(indices);
          this.sectorMesh = new THREE.Mesh(
            secGeo,
            new THREE.MeshBasicMaterial({
              color: 0x0284c7,
              transparent: true,
              opacity: 0.3,
              side: THREE.DoubleSide
            })
          );
          worldGroup.add(this.sectorMesh);
        }

        // Дотичний вектор швидкості v та центральна сила тяжіння F_g
        const hAng = Math.sqrt(mu * pSemi);
        const vr = (mu / hAng) * e * Math.sin(this.theta);
        const vTheta = (mu / hAng) * (1 + e * Math.cos(this.theta));
        const vx = vr * Math.cos(this.theta) - vTheta * Math.sin(this.theta);
        const vz = -(vr * Math.sin(this.theta) + vTheta * Math.cos(this.theta));
        const vVec = new THREE.Vector3(vx, 0, vz);
        const speed = vVec.length();

        this.arrowVel.update(
          planetPos.clone().add(new THREE.Vector3(0, 0.35, 0)),
          vVec.length() > 0.001 ? vVec : new THREE.Vector3(0, 0, -1),
          Math.min(2.6, speed * 0.48),
          uiState.showVectors,
          uiState.showLabels
        );

        const fgMag = (mu * p.planetMass) / (r * r);
        const toStar = new THREE.Vector3(-px, 0, -pz).normalize();
        this.arrowGrav.update(
          planetPos,
          toStar,
          Math.min(2.5, fgMag * 0.7),
          uiState.showVectors,
          uiState.showLabels
        );

        const ek = 0.5 * p.planetMass * speed * speed;
        const ugMag = (mu * p.planetMass) / r;
        const angMomL = p.planetMass * hAng;
        const periodT = (2 * Math.PI * Math.pow(a, 1.5)) / Math.sqrt(mu);

        updateEnergyUI(ek, ugMag * 0.5, 0, 18, [
          { label: 'Радіус-вектор r', val: `${r.toFixed(2)} а.о.` },
          { label: 'Орбітальна швидкість v', val: `${(speed * 10).toFixed(1)} км/с` },
          { label: 'Сила тяжіння F_g', val: `${fgMag.toFixed(2)} Н` },
          { label: 'Період обертання T', val: `${periodT.toFixed(2)} с` }
        ]);
      }

      dispose() {
        if (this.sectorMesh) disposeObject3D(this.sectorMesh);
        if (this.radiusLine) disposeObject3D(this.radiusLine);
        this.arrowVel.dispose();
        this.arrowGrav.dispose();
      }
    }

    // ============================================================================
    // 11h. МОДУЛЬ § 18: МОМЕНТ ІНЕРЦІЇ ТА КОЧЕННЯ ТІЛ З ГІРКИ
    // ============================================================================
    class RollingInertiaSimulation {
      constructor() {
        this.rampLength = 10.5;
        this.sDist = 0;
        this.sHoop = 0;
        this.vLinear = 0;
        this.vHoop = 0;
        this.phaseTriggered = false;
        this.particles = new EnergyParticleSystem(100);
        this.buildScene();
        this.reset();
      }

      buildScene() {
        this.rampGroup = new THREE.Group();
        worldGroup.add(this.rampGroup);

        // Дошка похилої площини (широка для двох доріжок: досліджуване тіло + еталонний обруч)
        const boardGeo = new THREE.BoxGeometry(this.rampLength, 0.24, 3.7);
        const boardMat = new THREE.MeshStandardMaterial({ color: 0xd6c7b2, roughness: 0.68 });
        this.boardMesh = new THREE.Mesh(boardGeo, boardMat);
        this.boardMesh.castShadow = true;
        this.boardMesh.receiveShadow = true;
        this.rampGroup.add(this.boardMesh);

        // Бічні латунні бортики-напрямні та центральний розділювач доріжок
        const railMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.45, metalness: 0.35 });
        [-1.8, 0, 1.8].forEach((zOff, idx) => {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(this.rampLength - 0.1, idx === 1 ? 0.06 : 0.14, idx === 1 ? 0.06 : 0.1),
            railMat
          );
          rail.position.set(0, 0.15, zOff);
          this.rampGroup.add(rail);
        });

        // Мірна шкала вздовж схилу (штрихи через кожен метр)
        const tickMat = new THREE.MeshBasicMaterial({ color: 0x44403c });
        for (let m = 0; m <= 8; m++) {
          const tick = new THREE.Mesh(
            new THREE.BoxGeometry(0.035, 0.01, m % 2 === 0 ? 3.4 : 1.6),
            tickMat
          );
          tick.position.set(-this.rampLength / 2 + 0.9 + m * 1.05, 0.126, 0);
          this.rampGroup.add(tick);
        }

        // Верхні стартові ворота та нижня фінішна арка фотодатчика з гумовим відбійником
        const gateMat = new THREE.MeshStandardMaterial({ color: 0x292524, metalness: 0.55, roughness: 0.35 });
        const finishArch = new THREE.Group();
        finishArch.position.set(this.rampLength / 2 - 0.75, 0.12, 0);
        [-1.72, 1.72].forEach(zPos => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.75, 12), gateMat);
          post.position.set(0, 0.87, zPos);
          finishArch.add(post);
        });
        const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 3.6), gateMat);
        crossBar.position.set(0, 1.72, 0);
        finishArch.add(crossBar);

        this.finishLed = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 14, 14),
          new THREE.MeshBasicMaterial({ color: 0x16a34a })
        );
        this.finishLed.position.set(0, 1.84, 0);
        finishArch.add(this.finishLed);

        const stopBumper = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.32, 3.5),
          new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 })
        );
        stopBumper.position.set(0.32, 0.16, 0);
        finishArch.add(stopBumper);
        this.rampGroup.add(finishArch);

        // Лабораторна гвинтова підйомна стійка під лівим краєм гірки
        this.pillarGroup = new THREE.Group();
        this.pillarBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.65, 0.16, 24),
          new THREE.MeshStandardMaterial({ color: 0x44403c, metalness: 0.4, roughness: 0.6 })
        );
        this.pillarBase.position.set(0, 0.08, 0);
        this.pillarGroup.add(this.pillarBase);

        this.pillarMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.22, 1, 20),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.65, roughness: 0.32 })
        );
        this.pillarGroup.add(this.pillarMesh);
        worldGroup.add(this.pillarGroup);

        // Досліджуване тіло кочення (передня доріжка z = +0.9) зі змінною внутрішньою геометрією маси
        this.rollerGroup = new THREE.Group();
        this.coreCylinder = new THREE.Mesh(
          new THREE.CylinderGeometry(0.92, 0.92, 0.68, 32),
          new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.32, metalness: 0.35 })
        );
        this.coreCylinder.rotation.x = Math.PI / 2;
        this.coreCylinder.castShadow = true;
        this.rollerGroup.add(this.coreCylinder);

        this.rimTorus = new THREE.Mesh(
          new THREE.CylinderGeometry(1.0, 1.0, 0.72, 36, 1, true),
          new THREE.MeshStandardMaterial({
            color: 0xb45309,
            roughness: 0.28,
            metalness: 0.68,
            side: THREE.DoubleSide
          })
        );
        this.rimTorus.rotation.x = Math.PI / 2;
        this.rollerGroup.add(this.rimTorus);

        // Латунна маточина та 6 маркерних спиць для чіткої візуалізації кутової швидкості ω
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 0.78, 20),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.7, roughness: 0.25 })
        );
        hub.rotation.x = Math.PI / 2;
        this.rollerGroup.add(hub);

        for (let i = 0; i < 3; i++) {
          const spoke = new THREE.Mesh(
            new THREE.BoxGeometry(1.94, 0.08, 0.75),
            new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.35 })
          );
          spoke.rotation.z = (i * Math.PI) / 3;
          this.rollerGroup.add(spoke);
        }
        this.rampGroup.add(this.rollerGroup);

        // Еталонний тонкий обруч (β = 1.0) на задній доріжці (z = -0.95) для наочного порівняння
        this.refHoopGroup = new THREE.Group();
        const refRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.94, 0.08, 16, 36),
          new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.35, transparent: true, opacity: 0.78 })
        );
        this.refHoopGroup.add(refRing);
        for (let i = 0; i < 2; i++) {
          const refCross = new THREE.Mesh(
            new THREE.BoxGeometry(1.82, 0.06, 0.12),
            new THREE.MeshStandardMaterial({ color: 0xfca5a5 })
          );
          refCross.rotation.z = (i * Math.PI) / 2;
          this.refHoopGroup.add(refCross);
        }
        this.rampGroup.add(this.refHoopGroup);

        this.arrowVel = new SmartVectorArrow('v (поступальна)', 0x166534, '#166534');
        this.arrowMg = new SmartVectorArrow('mg·sin α', 0xb91c1c, '#b91c1c');
        this.arrowFric = new SmartVectorArrow('F_тер (спокою)', 0xb45309, '#b45309');
      }

      syncVisuals() {
        this.updateVisuals();
      }

      reset() {
        this.sDist = 0;
        this.sHoop = 0;
        this.vLinear = 0;
        this.vHoop = 0;
        this.phaseTriggered = false;
        this.particles.clear();
        this.updateVisuals();
      }

      update(dt) {
        const p = sceneParams.gyroscope;
        const rad = (p.angle * Math.PI) / 180;
        const g = 9.81;
        const maxTravel = this.rampLength - 1.8;

        const accMain = (g * Math.sin(rad)) / (1 + p.betaFactor);
        const accHoop = (g * Math.sin(rad)) / 2.0;

        if (this.sDist < maxTravel) {
          this.vLinear += accMain * dt;
          this.sDist = Math.min(maxTravel, this.sDist + this.vLinear * dt);
          if (this.sDist >= maxTravel) {
            this.vLinear = Math.sqrt(2 * accMain * maxTravel);
          }
        } else if (!this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }

        if (this.sHoop < maxTravel) {
          this.vHoop += accHoop * dt;
          this.sHoop = Math.min(maxTravel, this.sHoop + this.vHoop * dt);
          if (this.sHoop >= maxTravel) {
            this.vHoop = Math.sqrt(2 * accHoop * maxTravel);
          }
        }

        this.particles.update(dt);
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.gyroscope;
        const rad = (p.angle * Math.PI) / 180;
        const halfL = this.rampLength / 2;

        // Позиціонуємо похилу дошку так, щоб правий край торкався підлоги
        const centerY = halfL * Math.sin(rad) + 0.14;
        this.rampGroup.position.set(0, centerY, 0);
        this.rampGroup.rotation.z = -rad;

        const leftX = -halfL * Math.cos(rad) * 0.86;
        const leftH = centerY + halfL * Math.sin(rad) * 0.86;
        this.pillarBase.position.set(leftX, 0.08, 0);
        this.pillarMesh.scale.set(1, Math.max(0.2, leftH), 1);
        this.pillarMesh.position.set(leftX, leftH / 2, 0);

        const r = p.radius;
        this.rollerGroup.scale.setScalar(r);
        // Чим більший β, тим більше маса сконцентрована на ободі (серцевина звужується)
        const coreScale = Math.max(0.18, 1.0 - (p.betaFactor - 0.35) * 1.15);
        this.coreCylinder.scale.set(coreScale, 1, coreScale);

        const maxTravel = this.rampLength - 1.8;
        this.finishLed.material.color.setHex(this.sDist >= maxTravel - 0.05 ? 0xf59e0b : 0x16a34a);

        const localX = -halfL + 0.9 + this.sDist;
        const localY = 0.12 + r;
        this.rollerGroup.position.set(localX, localY, 0.9);
        this.rollerGroup.rotation.z = -this.sDist / r;

        this.refHoopGroup.visible = uiState.showTrails;
        this.refHoopGroup.scale.setScalar(r);
        this.refHoopGroup.position.set(-halfL + 0.9 + this.sHoop, localY, -0.95);
        this.refHoopGroup.rotation.z = -this.sHoop / r;

        // Світові координати центра тіла кочення
        this.rampGroup.updateMatrixWorld(true);
        const worldPos = new THREE.Vector3(localX, localY, 0.9).applyMatrix4(this.rampGroup.matrixWorld);
        const downSlopeDir = new THREE.Vector3(Math.cos(rad), -Math.sin(rad), 0).normalize();
        const upSlopeDir = downSlopeDir.clone().negate();

        this.arrowVel.update(
          worldPos.clone().add(new THREE.Vector3(0, r + 0.25, 0)),
          downSlopeDir,
          Math.min(2.6, 0.35 + this.vLinear * 0.28),
          uiState.showVectors,
          uiState.showLabels
        );

        const mgSin = p.mass * 9.81 * Math.sin(rad);
        this.arrowMg.update(
          worldPos,
          downSlopeDir,
          Math.min(2.4, mgSin * 0.12),
          uiState.showVectors,
          uiState.showLabels
        );

        const fStatic = mgSin * (p.betaFactor / (1 + p.betaFactor));
        const contactPt = new THREE.Vector3(localX, 0.14, 0.9).applyMatrix4(this.rampGroup.matrixWorld);
        this.arrowFric.update(
          contactPt,
          upSlopeDir,
          Math.min(2.1, fStatic * 0.22),
          uiState.showVectors,
          uiState.showLabels
        );

        const hRem = Math.max(0, (maxTravel - this.sDist) * Math.sin(rad));
        const hMax = maxTravel * Math.sin(rad);
        const eTrans = 0.5 * p.mass * this.vLinear * this.vLinear;
        const eRot = eTrans * p.betaFactor;
        const ep = p.mass * 9.81 * hRem;
        const eTotal = p.mass * 9.81 * hMax;
        const omega = this.vLinear / r;

        updateEnergyUI(eTrans, ep, eRot, eTotal, [
          { label: 'Прискорення a', val: `${((9.81 * Math.sin(rad)) / (1 + p.betaFactor)).toFixed(2)} м/с²` },
          { label: 'Лінійна швидкість v', val: `${this.vLinear.toFixed(2)} м/с` },
          { label: 'Кутова швидкість ω', val: `${omega.toFixed(1)} рад/с` },
          { label: 'Момент інерції I', val: `${(p.betaFactor * p.mass * r * r).toFixed(2)} кг·м²` }
        ]);
      }

      dispose() {
        this.arrowVel.dispose();
        this.arrowMg.dispose();
        this.arrowFric.dispose();
        this.particles.dispose();
      }
    }

    // ============================================================================
    // 11i. МОДУЛЬ § 19: СТОЯЧА ХВИЛЯ ТА ГАРМОНІКИ СТРУНИ
    // ============================================================================
    class StandingWaveSimulation {
      constructor() {
        this.stringLen = 9.6;
        this.stringY = 2.4;
        this.phaseTriggered = false;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Акустичний резонаторний корпус монохорда Мельде
        const soundboxGroup = new THREE.Group();
        const baseBoard = new THREE.Mesh(
          new THREE.BoxGeometry(11.6, 0.68, 2.5),
          new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.62, metalness: 0.08 })
        );
        baseBoard.position.set(-0.2, 0.34, 0);
        baseBoard.castShadow = true;
        baseBoard.receiveShadow = true;
        soundboxGroup.add(baseBoard);

        // Верхня дека з двома резонаторними отворами та мірною шкалою
        const soundHoleMat = new THREE.MeshBasicMaterial({ color: 0x1c1917 });
        [-2.4, 2.4].forEach(xHole => {
          const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.02, 28), soundHoleMat);
          hole.position.set(xHole, 0.69, 0);
          soundboxGroup.add(hole);
          const rosette = new THREE.Mesh(
            new THREE.TorusGeometry(0.54, 0.03, 10, 32),
            new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.65, roughness: 0.3 })
          );
          rosette.rotation.x = Math.PI / 2;
          rosette.position.set(xHole, 0.69, 0);
          soundboxGroup.add(rosette);
        });

        // Мірна шкала вздовж деки монохорда
        const scaleStrip = new THREE.Mesh(
          new THREE.BoxGeometry(this.stringLen, 0.02, 0.24),
          new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.4 })
        );
        scaleStrip.position.set(0, 0.69, 0.88);
        soundboxGroup.add(scaleStrip);
        worldGroup.add(soundboxGroup);

        // Два призматичні мостики-підставки (опори струни x = ±4.8)
        const bridgeGeo = new THREE.CylinderGeometry(0.06, 0.26, this.stringY - 0.68, 4);
        const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.45, metalness: 0.5 });
        const leftBridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        leftBridge.rotation.y = Math.PI / 4;
        leftBridge.position.set(-this.stringLen / 2, (this.stringY + 0.68) / 2, 0);
        leftBridge.castShadow = true;
        worldGroup.add(leftBridge);

        const rightBridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        rightBridge.rotation.y = Math.PI / 4;
        rightBridge.position.set(this.stringLen / 2, (this.stringY + 0.68) / 2, 0);
        rightBridge.castShadow = true;
        worldGroup.add(rightBridge);

        // Ліворуч: Електромагнітний збуджувач коливань (генератор Мельде)
        const exciterBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.75, 1.35, 1.2),
          new THREE.MeshStandardMaterial({ color: 0x292524, metalness: 0.5, roughness: 0.4 })
        );
        exciterBox.position.set(-this.stringLen / 2 - 0.58, 1.35, 0);
        worldGroup.add(exciterBox);

        const exciterCoil = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.26, 0.5, 20),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.28 })
        );
        exciterCoil.position.set(-this.stringLen / 2 - 0.52, 2.15, 0);
        worldGroup.add(exciterCoil);

        // Праворуч: Невагомий блок (шкив) і підвішений вантаж натягу T = mg
        this.pulleyX = this.stringLen / 2 + 0.72;
        this.pulleyWheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.32, 0.14, 28),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.75, roughness: 0.25 })
        );
        this.pulleyWheel.rotation.x = Math.PI / 2;
        this.pulleyWheel.position.set(this.pulleyX, this.stringY - 0.32, 0);
        worldGroup.add(this.pulleyWheel);

        const pulleyBracket = new THREE.Mesh(
          new THREE.BoxGeometry(0.95, 0.14, 0.36),
          new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.6 })
        );
        pulleyBracket.position.set(this.stringLen / 2 + 0.35, this.stringY - 0.32, 0);
        worldGroup.add(pulleyBracket);

        // Вертикальна ділянка струни за блоком і гиря натягу T
        const hangCord = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(this.stringLen / 2, this.stringY, 0),
            new THREE.Vector3(this.pulleyX, this.stringY, 0),
            new THREE.Vector3(this.pulleyX + 0.32, this.stringY - 0.32, 0),
            new THREE.Vector3(this.pulleyX + 0.32, 0.95, 0)
          ]),
          new THREE.LineBasicMaterial({ color: 0xd97706 })
        );
        worldGroup.add(hangCord);

        this.tensionWeight = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.36, 0.75, 24),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.75, roughness: 0.25 })
        );
        this.tensionWeight.position.set(this.pulleyX + 0.32, 0.65, 0);
        this.tensionWeight.castShadow = true;
        worldGroup.add(this.tensionWeight);

        // Тонка рівноважна вісь струни
        const eqGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-this.stringLen / 2, this.stringY, 0),
          new THREE.Vector3(this.stringLen / 2, this.stringY, 0)
        ]);
        this.eqLine = new THREE.Line(
          eqGeo,
          new THREE.LineBasicMaterial({ color: 0x78716c, transparent: true, opacity: 0.45 })
        );
        worldGroup.add(this.eqLine);

        this.stringMesh = null;
        this.envUpperLine = null;
        this.envLowerLine = null;
        this.envelopeRibbon = null;
        this.nodesGroup = new THREE.Group();
        worldGroup.add(this.nodesGroup);

        this.arrowAntinodeV = new SmartVectorArrow('v_y (пучність)', 0x166534, '#166534');
        this.arrowTension = new SmartVectorArrow('T (натяг струни)', 0xb45309, '#b45309');
      }

      syncVisuals() {
        this.updateVisuals();
      }

      reset() {
        this.phaseTriggered = false;
        this.updateVisuals();
      }

      update(dt) {
        if (uiState.simTime > 1.6 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.standingwave;
        const n = Math.round(p.harmonicN);
        const L = this.stringLen;
        const vWave = Math.sqrt(p.tension / (p.linearMu * 0.001));
        const lambdaN = (2 * L) / n;
        const freq = vWave / lambdaN;
        const omega = (2 * Math.PI * freq) * 0.06;
        const t = uiState.simTime;

        const cosTerm = Math.cos(omega * t);
        const sinTerm = -Math.sin(omega * t);

        // Масштабуємо гирю натягу пропорційно T
        const wScale = 0.75 + (p.tension / 100) * 0.55;
        this.tensionWeight.scale.set(wScale, wScale, wScale);

        if (this.stringMesh) disposeObject3D(this.stringMesh);
        if (this.envUpperLine) disposeObject3D(this.envUpperLine);
        if (this.envLowerLine) disposeObject3D(this.envLowerLine);
        if (this.envelopeRibbon) disposeObject3D(this.envelopeRibbon);

        const pts = [];
        const envUp = [];
        const envDown = [];
        const ribbonVerts = [];
        const ribbonIndices = [];
        const segs = 96;
        for (let i = 0; i <= segs; i++) {
          const u = i / segs;
          const x = -L / 2 + u * L;
          const spatial = p.amplitude * Math.sin(n * Math.PI * u);
          const y = this.stringY + spatial * cosTerm;
          pts.push(new THREE.Vector3(x, y, 0));
          envUp.push(new THREE.Vector3(x, this.stringY + spatial, 0));
          envDown.push(new THREE.Vector3(x, this.stringY - spatial, 0));

          ribbonVerts.push(x, this.stringY + spatial, -0.02);
          ribbonVerts.push(x, this.stringY - spatial, -0.02);
          if (i < segs) {
            const base = i * 2;
            ribbonIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
          }
        }

        const curve = new THREE.CatmullRomCurve3(pts);
        const tubeRadius = 0.042 + p.linearMu * 0.006;
        const tubeGeo = new THREE.TubeGeometry(curve, 96, tubeRadius, 12, false);
        this.stringMesh = new THREE.Mesh(
          tubeGeo,
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.22, metalness: 0.8 })
        );
        this.stringMesh.castShadow = true;
        worldGroup.add(this.stringMesh);

        // Напівпрозора стрічка пучностей стоячої хвилі (±2A sin(kx))
        const ribGeo = new THREE.BufferGeometry();
        ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonVerts, 3));
        ribGeo.setIndex(ribbonIndices);
        this.envelopeRibbon = new THREE.Mesh(
          ribGeo,
          new THREE.MeshBasicMaterial({
            color: 0x3b82f6,
            transparent: true,
            opacity: 0.14,
            side: THREE.DoubleSide
          })
        );
        this.envelopeRibbon.visible = uiState.showTrails;
        worldGroup.add(this.envelopeRibbon);

        this.envUpperLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(envUp),
          new THREE.LineBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.55 })
        );
        this.envLowerLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(envDown),
          new THREE.LineBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.55 })
        );
        this.envUpperLine.visible = uiState.showTrails;
        this.envLowerLine.visible = uiState.showTrails;
        worldGroup.add(this.envUpperLine);
        worldGroup.add(this.envLowerLine);

        // Вузли стоячої хвилі (червоні сфери з кільцями у нерухомих точках)
        clearGroup3D(this.nodesGroup);
        if (uiState.showParticles) {
          const nodeGeo = new THREE.SphereGeometry(0.11, 16, 16);
          const nodeMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.28 });
          const ringGeo = new THREE.TorusGeometry(0.18, 0.02, 10, 24);
          const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.65 });
          for (let k = 0; k <= n; k++) {
            const nx = -L / 2 + (k / n) * L;
            const m = new THREE.Mesh(nodeGeo, nodeMat);
            m.position.set(nx, this.stringY, 0);
            this.nodesGroup.add(m);
            const rMesh = new THREE.Mesh(ringGeo, ringMat);
            rMesh.rotation.y = Math.PI / 2;
            rMesh.position.set(nx, this.stringY, 0);
            this.nodesGroup.add(rMesh);
          }
        }

        // Вектор швидкості першої пучності
        const firstAntinodeX = -L / 2 + L / (2 * n);
        const firstAntinodeY = this.stringY + p.amplitude * cosTerm;
        const vyAntinode = p.amplitude * omega * sinTerm;

        this.arrowAntinodeV.update(
          new THREE.Vector3(firstAntinodeX, firstAntinodeY, 0),
          new THREE.Vector3(0, vyAntinode >= 0 ? 1 : -1, 0),
          Math.min(2.2, Math.abs(vyAntinode) * 0.35 + 0.15),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowTension.update(
          new THREE.Vector3(L / 2 - 0.15, this.stringY, 0),
          new THREE.Vector3(1, 0, 0),
          Math.min(2.4, p.tension * 0.026),
          uiState.showVectors,
          uiState.showLabels
        );

        const wTot = 0.25 * p.tension * Math.pow(n * Math.PI * p.amplitude / L, 2) * L;
        const ek = wTot * sinTerm * sinTerm;
        const ep = wTot * cosTerm * cosTerm;

        updateEnergyUI(ek, ep, 0, Math.max(0.5, wTot), [
          { label: 'Довжина хвилі λ_n', val: `${lambdaN.toFixed(2)} м` },
          { label: 'Власна частота f_n', val: `${freq.toFixed(1)} Гц` },
          { label: 'Швидкість хвилі v', val: `${vWave.toFixed(1)} м/с` },
          { label: 'Вузлів / Пучностей', val: `${n + 1} / ${n}` }
        ]);
      }

      dispose() {
        if (this.stringMesh) disposeObject3D(this.stringMesh);
        if (this.envUpperLine) disposeObject3D(this.envUpperLine);
        if (this.envLowerLine) disposeObject3D(this.envLowerLine);
        if (this.envelopeRibbon) disposeObject3D(this.envelopeRibbon);
        this.arrowAntinodeV.dispose();
        this.arrowTension.dispose();
      }
    }

    // ============================================================================
    // 11j. МОДУЛЬ § 20: ЕФЕКТ ДОПЛЕРА ТА РУХОМИЙ ХВИЛЬОВИЙ ФРОНТ
    // ============================================================================
    class DopplerWavefrontSimulation {
      constructor() {
        this.planeY = 1.6;
        this.sourceX = -3.8;
        this.waveCrests = [];
        this.emitTimer = 0;
        this.phaseTriggered = false;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Опорна акустична колія-лінійка вздовж осі руху джерела
        const trackRail = new THREE.Mesh(
          new THREE.BoxGeometry(11.6, 0.14, 0.65),
          new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.65, metalness: 0.35 })
        );
        trackRail.position.set(0, 0.07, 0);
        trackRail.receiveShadow = true;
        worldGroup.add(trackRail);

        // Обтічний надзвуковий випромінювач (фюзеляж із носовим конусом та акустичним куполом)
        this.sourceGroup = new THREE.Group();
        const fuselage = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.28, 0.85, 24),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.65, roughness: 0.28 })
        );
        fuselage.rotation.z = -Math.PI / 2;
        fuselage.castShadow = true;
        this.sourceGroup.add(fuselage);

        const noseCone = new THREE.Mesh(
          new THREE.ConeGeometry(0.24, 0.55, 24),
          new THREE.MeshStandardMaterial({ color: 0xd97706, emissive: 0xb45309, emissiveIntensity: 0.45, roughness: 0.25 })
        );
        noseCone.rotation.z = -Math.PI / 2;
        noseCone.position.set(0.68, 0, 0);
        this.sourceGroup.add(noseCone);

        const tailFin = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.46, 0.05),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.5 })
        );
        tailFin.position.set(-0.26, 0.24, 0);
        this.sourceGroup.add(tailFin);

        const emitterBeacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 20, 20),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        emitterBeacon.position.set(0.1, 0, 0);
        this.sourceGroup.add(emitterBeacon);
        worldGroup.add(this.sourceGroup);

        // Нерухомі параболічні мікрофони-приймачі попереду (x = +5.5, синій) та позаду (x = -5.5, червоний)
        this.receiverFront = this.createReceiverStation(5.5, -1, 0x1d4ed8);
        this.receiverBack = this.createReceiverStation(-5.5, 1, 0xb91c1c);
        worldGroup.add(this.receiverFront);
        worldGroup.add(this.receiverBack);

        this.crestsGroup = new THREE.Group();
        worldGroup.add(this.crestsGroup);

        this.machConeGroup = new THREE.Group();
        worldGroup.add(this.machConeGroup);

        this.arrowSourceV = new SmartVectorArrow('v_s (джерело)', 0x166534, '#166534');
        this.arrowWaveFront = new SmartVectorArrow('c (фронт попереду)', 0x1d4ed8, '#1d4ed8');
      }

      createReceiverStation(xPos, faceDir, accentColor) {
        const g = new THREE.Group();
        g.position.set(xPos, 0, 0);

        const standBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.5, 0.16, 20),
          new THREE.MeshStandardMaterial({ color: 0x44403c, metalness: 0.45, roughness: 0.5 })
        );
        standBase.position.set(0, 0.08, 0);
        g.add(standBase);

        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.12, this.planeY, 16),
          new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.6, roughness: 0.35 })
        );
        post.position.set(0, this.planeY / 2, 0);
        g.add(post);

        // Параболічна тарілка мікрофона, спрямована до джерела
        const dish = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.14, 0.32, 24, 1, true),
          new THREE.MeshStandardMaterial({
            color: accentColor,
            metalness: 0.45,
            roughness: 0.3,
            side: THREE.DoubleSide
          })
        );
        dish.rotation.z = faceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
        dish.position.set(0, this.planeY, 0);
        g.add(dish);

        const micTip = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        micTip.position.set(faceDir * 0.2, this.planeY, 0);
        g.userData.micTip = micTip;
        g.add(micTip);

        return g;
      }

      seedInitialWavefronts() {
        clearGroup3D(this.crestsGroup);
        this.waveCrests = [];

        const p = sceneParams.doppler;
        const vs = p.machRatio * p.waveSpeed;
        const period = 1 / p.emitFreq;

        // Створюємо 8 концентричних/зміщених 3D-гребенів хвильового фронту для миттєвої наочності
        for (let k = 1; k <= 8; k++) {
          const age = k * period * 0.48;
          const emitX = this.sourceX - vs * age;
          const radius = p.waveSpeed * age;
          this.spawnCrestAt(emitX, radius);
        }
      }

      spawnCrestAt(emitX, initialRadius = 0.12) {
        const ringGeo = new THREE.TorusGeometry(1, 0.045, 14, 64);
        ringGeo.rotateX(Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.25,
          transparent: true,
          opacity: 0.85,
          roughness: 0.25
        });
        const mesh = new THREE.Mesh(ringGeo, mat);
        mesh.position.set(emitX, this.planeY, 0);
        mesh.scale.set(initialRadius, 1, initialRadius);
        this.crestsGroup.add(mesh);
        this.waveCrests.push({ mesh, emitX, radius: initialRadius });
      }

      syncVisuals() {
        if (!uiState.running) {
          this.seedInitialWavefronts();
        }
        this.updateVisuals();
      }

      reset() {
        this.sourceX = -2.0;
        this.emitTimer = 0;
        this.phaseTriggered = false;
        this.seedInitialWavefronts();
        this.updateVisuals();
      }

      update(dt) {
        const p = sceneParams.doppler;
        const vs = p.machRatio * p.waveSpeed;
        this.sourceX += vs * dt * 0.45;
        if (this.sourceX > 3.6) {
          this.sourceX = -3.6;
          this.seedInitialWavefronts();
        }

        const emitInterval = (1 / p.emitFreq) * 0.48;
        this.emitTimer += dt * 0.45;
        if (this.emitTimer >= emitInterval) {
          this.emitTimer = 0;
          this.spawnCrestAt(this.sourceX, 0.12);
        }

        for (let i = this.waveCrests.length - 1; i >= 0; i--) {
          const c = this.waveCrests[i];
          c.radius += p.waveSpeed * dt * 0.45;
          if (c.radius > 7.8) {
            disposeObject3D(c.mesh);
            this.waveCrests.splice(i, 1);
          }
        }

        if (uiState.simTime > 1.8 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.doppler;
        const vs = p.machRatio * p.waveSpeed;
        this.sourceGroup.position.set(this.sourceX, this.planeY, 0);

        this.crestsGroup.visible = uiState.showParticles;
        this.waveCrests.forEach(c => {
          c.mesh.scale.set(c.radius, 1, c.radius);
          const fade = Math.max(0.08, (1 - c.radius / 7.8) * Math.min(1, p.amplitude));
          c.mesh.material.opacity = fade;
        });

        // 3D-Конус Маха при надзвуковому/надхвильовому русі (M >= 1)
        clearGroup3D(this.machConeGroup);
        if (p.machRatio >= 1.0 && uiState.showTrails) {
          const sinAlpha = 1 / p.machRatio;
          const alpha = Math.asin(Math.min(0.99, sinAlpha));
          const len = 7.2;
          const coneHeight = len * Math.cos(alpha);
          const coneRadius = len * Math.sin(alpha);

          const coneMesh = new THREE.Mesh(
            new THREE.ConeGeometry(coneRadius, coneHeight, 36, 1, true),
            new THREE.MeshBasicMaterial({
              color: 0xef4444,
              transparent: true,
              opacity: 0.18,
              side: THREE.DoubleSide,
              depthWrite: false
            })
          );
          coneMesh.rotation.z = -Math.PI / 2;
          coneMesh.position.set(this.sourceX + 0.65 - coneHeight / 2, this.planeY, 0);
          this.machConeGroup.add(coneMesh);

          const pts = [
            new THREE.Vector3(this.sourceX + 0.65 - coneHeight, this.planeY, coneRadius),
            new THREE.Vector3(this.sourceX + 0.65, this.planeY, 0),
            new THREE.Vector3(this.sourceX + 0.65 - coneHeight, this.planeY, -coneRadius)
          ];
          this.machConeGroup.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(pts),
              new THREE.LineBasicMaterial({ color: 0xb91c1c })
            )
          );
        }

        this.arrowSourceV.update(
          new THREE.Vector3(this.sourceX, this.planeY + 0.45, 0),
          new THREE.Vector3(1, 0, 0),
          Math.min(2.5, vs * 0.42 + 0.05),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowWaveFront.update(
          new THREE.Vector3(this.sourceX + 0.4, this.planeY, 0),
          new THREE.Vector3(1, 0, 0),
          Math.min(2.4, p.waveSpeed * 0.36),
          uiState.showVectors,
          uiState.showLabels
        );

        const lambda0 = p.waveSpeed / p.emitFreq;
        const lambdaFront = Math.max(0.05, lambda0 * (1 - p.machRatio));
        const lambdaBack = lambda0 * (1 + p.machRatio);
        const fFront = p.machRatio < 0.96 ? p.emitFreq / (1 - p.machRatio) : p.emitFreq * 12;
        const fBack = p.emitFreq / (1 + p.machRatio);

        updateEnergyUI(fFront, p.emitFreq, fBack, fFront + p.emitFreq + fBack, [
          { label: 'Частота попереду f₊', val: p.machRatio < 1 ? `${fFront.toFixed(2)} Гц` : 'Ударна хвиля Маха' },
          { label: 'Частота позаду f₋', val: `${fBack.toFixed(2)} Гц` },
          { label: 'Довжина хвилі попереду λ₊', val: p.machRatio < 1 ? `${lambdaFront.toFixed(2)} м` : '0.00 м (фронт Маха)' },
          { label: 'Довжина хвилі позаду λ₋', val: `${lambdaBack.toFixed(2)} м` }
        ]);
      }

      dispose() {
        this.arrowSourceV.dispose();
        this.arrowWaveFront.dispose();
      }
    }

    // ============================================================================
    // 11k. МОДУЛЬ § 21: ПОЛЯРИЗАЦІЯ СВІТЛА — КУТ БРЮСТЕРА ТА ЗАКОН МАЛЮСА
    // ============================================================================
    class BrewsterPolarizationSimulation {
      constructor() {
        this.axisY = 2.4;
        this.phaseTriggered = false;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Оптична рейка з латунною напрямною та шкалою
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(12.2, 0.24, 1.05),
          new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.52, metalness: 0.45 })
        );
        rail.position.set(0, 0.12, 0);
        rail.receiveShadow = true;
        worldGroup.add(rail);

        const brassGuide = new THREE.Mesh(
          new THREE.BoxGeometry(11.9, 0.06, 0.26),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.28 })
        );
        brassGuide.position.set(0, 0.25, 0);
        worldGroup.add(brassGuide);

        // Лазерний коліматор з ребрами охолодження ліворуч (x = -5.3)
        const emitterGroup = new THREE.Group();
        emitterGroup.position.set(-5.3, this.axisY, 0);
        const emitterBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.44, 1.25, 24),
          new THREE.MeshStandardMaterial({ color: 0x292524, metalness: 0.65, roughness: 0.32 })
        );
        emitterBody.rotation.z = Math.PI / 2;
        emitterGroup.add(emitterBody);

        for (let i = -2; i <= 2; i++) {
          const fin = new THREE.Mesh(
            new THREE.CylinderGeometry(0.48, 0.48, 0.04, 24),
            new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.7, roughness: 0.28 })
          );
          fin.rotation.z = Math.PI / 2;
          fin.position.set(i * 0.18, 0, 0);
          emitterGroup.add(fin);
        }

        this.emitterAperture = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 0.08, 20),
          new THREE.MeshBasicMaterial({ color: 0x16a34a })
        );
        this.emitterAperture.rotation.z = Math.PI / 2;
        this.emitterAperture.position.set(0.62, 0, 0);
        emitterGroup.add(this.emitterAperture);

        const emitterPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.12, this.axisY - 0.25, 14),
          new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.65 })
        );
        emitterPost.position.set(0, -(this.axisY - 0.25) / 2, 0);
        emitterGroup.add(emitterPost);
        worldGroup.add(emitterGroup);

        // Діелектрична пластинка Брюстера на гоніометричному столику (x = -3.75)
        this.brewsterStageGroup = new THREE.Group();
        this.brewsterStageGroup.position.set(-3.75, this.axisY, 0);
        const brewsterGlass = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 1.85, 1.35),
          new THREE.MeshPhysicalMaterial({
            color: 0xbae6fd,
            transparent: true,
            opacity: 0.36,
            roughness: 0.08,
            metalness: 0.05
          })
        );
        this.brewsterGlass = brewsterGlass;
        this.brewsterStageGroup.add(brewsterGlass);

        const stageDial = new THREE.Mesh(
          new THREE.CylinderGeometry(0.52, 0.56, 0.1, 24),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.65, roughness: 0.3 })
        );
        stageDial.position.set(0, -1.05, 0);
        this.brewsterStageGroup.add(stageDial);

        const stagePost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.09, this.axisY - 1.2, 12),
          new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.6 })
        );
        stagePost.position.set(0, -1.05 - (this.axisY - 1.2) / 2, 0);
        this.brewsterStageGroup.add(stagePost);
        worldGroup.add(this.brewsterStageGroup);

        // Перший поляризатор P₁ (фіксована вертикальна вісь, x = -2.0)
        this.polarizerGroup = this.createPolaroidDisk(-2.0, 0x0284c7);
        worldGroup.add(this.polarizerGroup);

        // Другий поляроїд — обертовий аналізатор A (x = +1.5)
        this.analyzerGroup = this.createPolaroidDisk(1.5, 0x1d4ed8);
        worldGroup.add(this.analyzerGroup);

        // Екран фотодетектора з тубусом-блендою праворуч (x = +4.8)
        const screenStand = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 3.1, 2.8),
          new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.68 })
        );
        screenStand.position.set(4.8, 2.2, 0);
        screenStand.castShadow = true;
        worldGroup.add(screenStand);

        const hoodRing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.95, 0.95, 0.28, 32, 1, true),
          new THREE.MeshStandardMaterial({ color: 0x44403c, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide })
        );
        hoodRing.rotation.z = Math.PI / 2;
        hoodRing.position.set(4.58, this.axisY, 0);
        worldGroup.add(hoodRing);

        this.detectorSpot = new THREE.Mesh(
          new THREE.CircleGeometry(0.86, 32),
          new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
        );
        this.detectorSpot.rotation.y = -Math.PI / 2;
        this.detectorSpot.position.set(4.66, this.axisY, 0);
        worldGroup.add(this.detectorSpot);

        this.waveCurvesGroup = new THREE.Group();
        worldGroup.add(this.waveCurvesGroup);

        this.arrowE1 = new SmartVectorArrow('E₀ (після поляризатора)', 0x166534, '#166534');
        this.arrowE2 = new SmartVectorArrow('E = E₀·cos θ (після аналізатора)', 0x1d4ed8, '#1d4ed8');
      }

      createPolaroidDisk(xPos, rimColor) {
        const g = new THREE.Group();
        g.position.set(xPos, this.axisY, 0);

        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(1.35, 0.085, 16, 48),
          new THREE.MeshStandardMaterial({ color: rimColor, metalness: 0.55, roughness: 0.28 })
        );
        rim.rotation.y = Math.PI / 2;
        g.add(rim);

        // Латунне градусне кільце-лімб
        const brassBezel = new THREE.Mesh(
          new THREE.TorusGeometry(1.44, 0.032, 12, 48),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.72, roughness: 0.25 })
        );
        brassBezel.rotation.y = Math.PI / 2;
        g.add(brassBezel);

        for (let deg = 0; deg < 360; deg += 30) {
          const rad = (deg * Math.PI) / 180;
          const tick = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.12, 0.025),
            new THREE.MeshStandardMaterial({ color: 0xfef3c7 })
          );
          tick.position.set(0, Math.cos(rad) * 1.38, Math.sin(rad) * 1.38);
          tick.rotation.x = -rad;
          g.add(tick);
        }

        const glass = new THREE.Mesh(
          new THREE.CylinderGeometry(1.32, 1.32, 0.06, 36),
          new THREE.MeshPhysicalMaterial({
            color: 0xe0f2fe,
            transparent: true,
            opacity: 0.3,
            roughness: 0.1
          })
        );
        glass.rotation.z = Math.PI / 2;
        g.add(glass);

        // Штрихи осі пропускання кристала + маркер-стрілка на оправі
        const gridGroup = new THREE.Group();
        for (let i = -3; i <= 3; i++) {
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 2.35, 0.025),
            new THREE.MeshStandardMaterial({ color: 0x0f172a })
          );
          bar.position.set(0, 0, i * 0.3);
          gridGroup.add(bar);
        }
        const pointerKnob = new THREE.Mesh(
          new THREE.ConeGeometry(0.09, 0.24, 12),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.7, roughness: 0.25 })
        );
        pointerKnob.position.set(0, 1.52, 0);
        gridGroup.add(pointerKnob);

        g.userData.rotatableGrid = gridGroup;
        g.add(gridGroup);

        // Стійка та каретка на оптичній лаві
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.1, this.axisY - 1.2, 12),
          new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.65 })
        );
        post.position.set(0, -(this.axisY + 1.2) / 2, 0);
        g.add(post);

        const carriage = new THREE.Mesh(
          new THREE.BoxGeometry(0.48, 0.24, 1.15),
          new THREE.MeshStandardMaterial({ color: 0x292524, metalness: 0.5, roughness: 0.4 })
        );
        carriage.position.set(0, -this.axisY + 0.22, 0);
        g.add(carriage);

        return g;
      }

      wavelengthToHex(nm) {
        if (nm < 450) return 0x6366f1;
        if (nm < 500) return 0x06b6d4;
        if (nm < 560) return 0x16a34a;
        if (nm < 610) return 0xd97706;
        return 0xdc2626;
      }

      syncVisuals() {
        this.updateVisuals();
      }

      reset() {
        this.phaseTriggered = false;
        this.updateVisuals();
      }

      update(dt) {
        if (uiState.simTime > 1.6 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.brewster;
        const thetaRad = (p.analyzerAngle * Math.PI) / 180;
        const cosTheta = Math.cos(thetaRad);
        const waveHex = this.wavelengthToHex(p.wavelength);
        const brewsterRad = Math.atan(p.refractiveN);
        const brewsterDeg = (brewsterRad * 180) / Math.PI;

        this.emitterAperture.material.color.setHex(waveHex);

        // Нахиляємо скляну пластинку під кутом Брюстера θ_B = arctan(n)
        this.brewsterGlass.rotation.z = Math.PI / 2 - brewsterRad;

        // Повертаємо сітку аналізатора на кут θ навколо осі поширення променя X
        this.analyzerGroup.userData.rotatableGrid.rotation.x = thetaRad;

        clearGroup3D(this.waveCurvesGroup);

        const kWave = (2 * Math.PI) / 1.45;
        const omega = 5.5;
        const amp0 = 0.85 * Math.sqrt(p.incidentI0 / 100);

        if (uiState.showParticles) {
          // 1) Неполяризована хвиля до першого поляризатора (-4.65 .. -2.0): дві взаємно перпендикулярні площини
          const ptsUnpolY = [];
          const ptsUnpolZ = [];
          for (let i = 0; i <= 36; i++) {
            const x = -4.65 + (i / 36) * 2.6;
            const s = amp0 * Math.sin(kWave * x - omega * uiState.simTime);
            const c = amp0 * Math.cos(kWave * x - omega * uiState.simTime);
            ptsUnpolY.push(new THREE.Vector3(x, this.axisY + s, 0));
            ptsUnpolZ.push(new THREE.Vector3(x, this.axisY, c));
          }
          this.waveCurvesGroup.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(ptsUnpolY),
              new THREE.LineBasicMaterial({ color: waveHex })
            )
          );
          this.waveCurvesGroup.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(ptsUnpolZ),
              new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.65 })
            )
          );

          // Відбитий під кутом Брюстера s-поляризований промінь
          const reflLen = 1.65;
          const reflAngle = Math.PI - 2 * (Math.PI / 2 - brewsterRad);
          const reflEnd = new THREE.Vector3(
            -3.75 + Math.cos(reflAngle) * reflLen,
            this.axisY + Math.sin(reflAngle) * reflLen,
            0
          );
          this.waveCurvesGroup.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-3.75, this.axisY, 0),
                reflEnd
              ]),
              new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.75 })
            )
          );

          // 2) Лінійно поляризована хвиля між P₁ та аналізатором (-1.95 .. +1.45)
          const ptsPol1 = [];
          for (let i = 0; i <= 48; i++) {
            const x = -1.95 + (i / 48) * 3.4;
            const s = amp0 * Math.sin(kWave * x - omega * uiState.simTime);
            ptsPol1.push(new THREE.Vector3(x, this.axisY + s, 0));
          }
          const curve1 = new THREE.CatmullRomCurve3(ptsPol1);
          this.waveCurvesGroup.add(
            new THREE.Mesh(
              new THREE.TubeGeometry(curve1, 48, 0.038, 8, false),
              new THREE.MeshStandardMaterial({ color: waveHex, roughness: 0.3 })
            )
          );

          // 3) Хвиля після аналізатора (+1.55 .. +4.62): амплітуда E₀ cos θ, площина повернута на кут θ
          const ampOut = amp0 * Math.abs(cosTheta);
          if (ampOut > 0.02) {
            const ptsPol2 = [];
            for (let i = 0; i <= 44; i++) {
              const x = 1.55 + (i / 44) * 3.07;
              const osc = ampOut * Math.sin(kWave * x - omega * uiState.simTime);
              ptsPol2.push(
                new THREE.Vector3(
                  x,
                  this.axisY + osc * Math.cos(thetaRad),
                  osc * Math.sin(thetaRad)
                )
              );
            }
            const curve2 = new THREE.CatmullRomCurve3(ptsPol2);
            this.waveCurvesGroup.add(
              new THREE.Mesh(
                new THREE.TubeGeometry(curve2, 44, 0.036, 8, false),
                new THREE.MeshStandardMaterial({ color: waveHex, roughness: 0.3 })
              )
            );
          }
        }

        const iOut = p.incidentI0 * cosTheta * cosTheta;
        const iAbsorbed = p.incidentI0 - iOut;

        this.detectorSpot.material.color.setHex(waveHex);
        this.detectorSpot.material.opacity = Math.max(0.04, cosTheta * cosTheta * 0.95);

        this.arrowE1.update(
          new THREE.Vector3(-0.3, this.axisY, 0),
          new THREE.Vector3(0, 1, 0),
          Math.min(2.1, amp0 * 1.45),
          uiState.showVectors,
          uiState.showLabels
        );

        const dirE2 = new THREE.Vector3(0, Math.cos(thetaRad), Math.sin(thetaRad));
        this.arrowE2.update(
          new THREE.Vector3(3.05, this.axisY, 0),
          dirE2,
          Math.min(2.1, amp0 * Math.abs(cosTheta) * 1.45),
          uiState.showVectors,
          uiState.showLabels
        );

        updateEnergyUI(iOut, 0, iAbsorbed, Math.max(1, p.incidentI0), [
          { label: 'Інтенсивність I(θ)', val: `${iOut.toFixed(1)} Вт/м²` },
          { label: 'Коефіцієнт cos²θ', val: `${(cosTheta * cosTheta * 100).toFixed(1)} %` },
          { label: 'Кут Брюстера θ_B', val: `${brewsterDeg.toFixed(1)}°` },
          { label: 'Стан після аналізатора', val: p.analyzerAngle === 90 ? 'Повне гасіння (I = 0)' : `Лінійна (θ = ${p.analyzerAngle}°)` }
        ]);
      }

      dispose() {
        this.arrowE1.dispose();
        this.arrowE2.dispose();
      }
    }

    // ============================================================================
    // 11l. МОДУЛЬ § 22: ДИФРАКЦІЯ ФРАУНГОФЕРА НА ОДИНОЧНІЙ ЩІЛИНІ
    // ============================================================================
    class SingleSlitDiffractionSimulation {
      constructor() {
        this.axisY = 2.2;
        this.slitX = -1.8;
        this.phaseTriggered = false;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Оптична лава під дифракційним стендом
        const bench = new THREE.Mesh(
          new THREE.BoxGeometry(11.6, 0.22, 1.2),
          new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.55, metalness: 0.4 })
        );
        bench.position.set(0.2, 0.11, 0);
        bench.receiveShadow = true;
        worldGroup.add(bench);

        // Лазерний розширювач пучка ліворуч (x = -5.4)
        const laserGroup = new THREE.Group();
        laserGroup.position.set(-5.4, this.axisY, 0);
        const laserTube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.36, 1.1, 24),
          new THREE.MeshStandardMaterial({ color: 0x292524, metalness: 0.65, roughness: 0.32 })
        );
        laserTube.rotation.z = Math.PI / 2;
        laserGroup.add(laserTube);
        const expanderCone = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.32, 0.45, 24),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.28 })
        );
        expanderCone.rotation.z = Math.PI / 2;
        expanderCone.position.set(0.72, 0, 0);
        laserGroup.add(expanderCone);
        const laserPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.11, this.axisY - 0.22, 12),
          new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.6 })
        );
        laserPost.position.set(0, -(this.axisY - 0.22) / 2, 0);
        laserGroup.add(laserPost);
        worldGroup.add(laserGroup);

        // Оправа щілини з мікрометричним гвинтом регулювання розкриття b
        const frameTop = new THREE.Mesh(
          new THREE.BoxGeometry(0.36, 0.22, 6.8),
          new THREE.MeshStandardMaterial({ color: 0x1c1917, metalness: 0.5, roughness: 0.45 })
        );
        frameTop.position.set(this.slitX, 3.88, 0);
        worldGroup.add(frameTop);

        const frameBot = frameTop.clone();
        frameBot.position.set(this.slitX, 0.08, 0);
        worldGroup.add(frameBot);

        this.micrometerDrum = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 0.55, 20),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.75, roughness: 0.25 })
        );
        this.micrometerDrum.rotation.x = Math.PI / 2;
        this.micrometerDrum.position.set(this.slitX, 3.88, 3.65);
        worldGroup.add(this.micrometerDrum);

        // Непрозора ширма з регульованою вертикальною щілиною b
        const barrierMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.55, metalness: 0.35 });
        this.leftJaw = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.6, 3.2), barrierMat);
        this.rightJaw = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.6, 3.2), barrierMat);
        this.leftJaw.castShadow = true;
        this.rightJaw.castShadow = true;
        worldGroup.add(this.leftJaw);
        worldGroup.add(this.rightJaw);

        // Латунні скошені ножі щілини
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.75, roughness: 0.25 });
        this.leftBlade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.58, 0.08), bladeMat);
        this.rightBlade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.58, 0.08), bladeMat);
        worldGroup.add(this.leftBlade);
        worldGroup.add(this.rightBlade);

        // Екран спостереження дифракційного спектра sinc²(β)
        this.screenBoard = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 3.9, 7.6),
          new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.75 })
        );
        this.screenBoard.castShadow = true;
        worldGroup.add(this.screenBoard);

        this.planeFrontsGroup = new THREE.Group();
        this.diffractedArcsGroup = new THREE.Group();
        this.intensityProfileGroup = new THREE.Group();
        this.raysGroup = new THREE.Group();
        worldGroup.add(this.planeFrontsGroup);
        worldGroup.add(this.diffractedArcsGroup);
        worldGroup.add(this.intensityProfileGroup);
        worldGroup.add(this.raysGroup);

        this.arrowIncident = new SmartVectorArrow('k₀ (плоский фронт)', 0x166534, '#166534');
        this.arrowMinRay = new SmartVectorArrow('θ_m (мінімум)', 0xb91c1c, '#b91c1c');
      }

      wavelengthToHex(nm) {
        if (nm < 450) return 0x6366f1;
        if (nm < 500) return 0x06b6d4;
        if (nm < 560) return 0x16a34a;
        if (nm < 610) return 0xd97706;
        return 0xdc2626;
      }

      syncVisuals() {
        this.updateVisuals();
      }

      reset() {
        this.phaseTriggered = false;
        this.updateVisuals();
      }

      update(dt) {
        if (uiState.simTime > 1.6 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.diffraction;
        const gapVisual = 0.22 + p.slitWidth * 0.24;
        this.leftJaw.position.set(this.slitX, 1.98, -(gapVisual / 2 + 1.6));
        this.rightJaw.position.set(this.slitX, 1.98, gapVisual / 2 + 1.6);
        this.leftBlade.position.set(this.slitX, 1.98, -(gapVisual / 2));
        this.rightBlade.position.set(this.slitX, 1.98, gapVisual / 2);
        this.micrometerDrum.rotation.z = p.slitWidth * 2.4;

        const screenX = this.slitX + p.screenDist;
        this.screenBoard.position.set(screenX, 1.95, 0);

        const colorHex = this.wavelengthToHex(p.wavelength);
        const shift = (uiState.simTime * 1.6) % 0.85;

        // 1) Плоскі хвильові фронти перед щілиною
        clearGroup3D(this.planeFrontsGroup);
        if (uiState.showParticles) {
          for (let i = 0; i < 4; i++) {
            const x = -4.6 + i * 0.85 + shift;
            if (x < this.slitX - 0.12) {
              const sheet = new THREE.Mesh(
                new THREE.PlaneGeometry(3.2, 2.4),
                new THREE.MeshBasicMaterial({
                  color: colorHex,
                  transparent: true,
                  opacity: 0.34,
                  side: THREE.DoubleSide
                })
              );
              sheet.rotation.y = Math.PI / 2;
              sheet.position.set(x, this.axisY, 0);
              this.planeFrontsGroup.add(sheet);
            }
          }
        }

        // 2) Розбіжні циліндричні хвильові фронти Гюйгенса — Френеля після щілини
        clearGroup3D(this.diffractedArcsGroup);
        if (uiState.showParticles) {
          for (let i = 0; i < 6; i++) {
            const rad = 0.35 + i * 0.85 + shift;
            if (rad < p.screenDist - 0.1) {
              const arc = new THREE.Mesh(
                new THREE.CylinderGeometry(rad, rad, 1.6, 40, 1, true, 0, Math.PI),
                new THREE.MeshBasicMaterial({
                  color: colorHex,
                  transparent: true,
                  opacity: Math.max(0.08, 0.42 * (1 - rad / p.screenDist)),
                  side: THREE.DoubleSide
                })
              );
              arc.position.set(this.slitX, this.axisY, 0);
              this.diffractedArcsGroup.add(arc);
            }
          }
        }

        // 3) 3D-профіль інтенсивності I(θ) = I₀ (sin β / β)² на екрані
        clearGroup3D(this.intensityProfileGroup);
        const curvePts = [];
        const zRange = 3.5;
        const lambdaScaled = (p.wavelength / 550) * 1.15;
        for (let i = 0; i <= 80; i++) {
          const z = -zRange + (i / 80) * (2 * zRange);
          const sinTheta = z / Math.sqrt(p.screenDist * p.screenDist + z * z);
          const beta = (Math.PI * p.slitWidth * sinTheta) / lambdaScaled;
          const sinc = Math.abs(beta) < 1e-4 ? 1.0 : Math.sin(beta) / beta;
          const intensity = sinc * sinc;
          curvePts.push(new THREE.Vector3(screenX - 0.14 - intensity * 0.85, this.axisY - 1.2 + intensity * 2.5, z));

          if (i % 2 === 0) {
            const barH = Math.max(0.05, intensity * 2.6);
            const bar = new THREE.Mesh(
              new THREE.BoxGeometry(0.08, barH, 0.14),
              new THREE.MeshBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: Math.min(0.95, 0.12 + intensity * 0.88)
              })
            );
            bar.position.set(screenX - 0.12, this.axisY, z);
            this.intensityProfileGroup.add(bar);
          }
        }
        const envLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curvePts),
          new THREE.LineBasicMaterial({ color: 0xfef08a })
        );
        this.intensityProfileGroup.add(envLine);

        // Напрямок на m-й дифракційний мінімум: sin θ_m = m λ / b
        const sinMin = Math.min(0.85, (p.orderM * lambdaScaled) / p.slitWidth);
        const thetaMin = Math.asin(sinMin);
        const zMinOnScreen = p.screenDist * Math.tan(thetaMin);

        clearGroup3D(this.raysGroup);
        if (uiState.showTrails && Math.abs(zMinOnScreen) < 3.6) {
          const minPts = [
            new THREE.Vector3(this.slitX, this.axisY, zMinOnScreen),
            new THREE.Vector3(this.slitX, this.axisY, 0),
            new THREE.Vector3(screenX - 0.12, this.axisY, zMinOnScreen)
          ];
          this.raysGroup.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([minPts[1], minPts[2]]),
              new THREE.LineBasicMaterial({ color: 0xb91c1c })
            )
          );
        }

        this.arrowIncident.update(
          new THREE.Vector3(-4.2, this.axisY, 0),
          new THREE.Vector3(1, 0, 0),
          2.0,
          uiState.showVectors,
          uiState.showLabels
        );

        const minDir = new THREE.Vector3(Math.cos(thetaMin), 0, Math.sin(thetaMin));
        this.arrowMinRay.update(
          new THREE.Vector3(this.slitX, this.axisY + 0.2, 0),
          minDir,
          2.2,
          uiState.showVectors,
          uiState.showLabels
        );

        const centralWidthCm = (2 * p.wavelength * 1e-3 * p.screenDist) / p.slitWidth;
        const theta1Deg = (Math.asin(Math.min(1, (p.wavelength * 1e-3) / p.slitWidth)) * 180) / Math.PI;

        updateEnergyUI(90, centralWidthCm * 22, 10, 100, [
          { label: 'Ширина центр. піка Δy', val: `${centralWidthCm.toFixed(2)} см` },
          { label: 'Кут 1-го мінімуму θ₁', val: `${theta1Deg.toFixed(1)}°` },
          { label: 'Умова мінімуму b·sin θ', val: `${p.orderM}λ (${p.orderM * p.wavelength} нм)` },
          { label: 'Частка енергії в центрі', val: '90.3 %' }
        ]);
      }

      dispose() {
        this.arrowIncident.dispose();
        this.arrowMinRay.dispose();
      }
    }

    // ============================================================================
    // 11m. МОДУЛЬ § 23: ТЕПЛОВИЙ ДВИГУН ТА ЦИКЛ КАРНО
    // ============================================================================
    class CarnotEngineSimulation {
      constructor() {
        this.phaseTriggered = false;
        this.particles = new EnergyParticleSystem(100);
        this.gasMolecules = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Чавунна станина теплової машини
        const bedplate = new THREE.Mesh(
          new THREE.BoxGeometry(11.4, 0.26, 3.2),
          new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.65, metalness: 0.45 })
        );
        bedplate.position.set(0.1, 0.13, 0);
        bedplate.receiveShadow = true;
        worldGroup.add(bedplate);

        // Ліворуч: Гарячий резервуар (Нагрівник T₁) з розжареними спіралями
        this.hotBlock = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, 2.7, 2.2),
          new THREE.MeshStandardMaterial({
            color: 0xdc2626,
            emissive: 0x991b1b,
            emissiveIntensity: 0.45,
            roughness: 0.35
          })
        );
        this.hotBlock.position.set(-4.0, 1.58, 0);
        this.hotBlock.castShadow = true;
        worldGroup.add(this.hotBlock);

        for (let i = -1; i <= 1; i++) {
          const coilRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.28, 0.055, 10, 24),
            new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.8 })
          );
          coilRing.rotation.y = Math.PI / 2;
          coilRing.position.set(-2.98, 1.58 + i * 0.65, 0);
          worldGroup.add(coilRing);
        }

        // Мідний теплопровід від нагрівника до дна робочого циліндра
        const hotPipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 2.2, 16),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.75, roughness: 0.28 })
        );
        hotPipe.rotation.z = Math.PI / 2;
        hotPipe.position.set(-2.4, 0.65, 0);
        worldGroup.add(hotPipe);

        // Праворуч: Холодний резервуар (Холодильник T₂) з радіаторними пластинами
        this.coldBlock = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, 2.7, 2.2),
          new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            emissive: 0x0369a1,
            emissiveIntensity: 0.2,
            roughness: 0.35
          })
        );
        this.coldBlock.position.set(4.2, 1.58, 0);
        this.coldBlock.castShadow = true;
        worldGroup.add(this.coldBlock);

        for (let i = -3; i <= 3; i++) {
          const fin = new THREE.Mesh(
            new THREE.BoxGeometry(2.15, 0.06, 2.35),
            new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.55, roughness: 0.3 })
          );
          fin.position.set(4.2, 1.58 + i * 0.36, 0);
          worldGroup.add(fin);
        }

        const coldPipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 3.9, 16),
          new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.65, roughness: 0.3 })
        );
        coldPipe.rotation.z = Math.PI / 2;
        coldPipe.position.set(1.25, 0.65, 0);
        worldGroup.add(coldPipe);

        // Посередині: Прозорий робочий циліндр теплової машини (x = -0.8) з латунними фланцями
        const cylBotFlange = new THREE.Mesh(
          new THREE.CylinderGeometry(1.32, 1.36, 0.24, 32),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.28 })
        );
        cylBotFlange.position.set(-0.8, 0.36, 0);
        worldGroup.add(cylBotFlange);

        const cylTopFlange = new THREE.Mesh(
          new THREE.TorusGeometry(1.22, 0.1, 14, 36),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.28 })
        );
        cylTopFlange.rotation.x = Math.PI / 2;
        cylTopFlange.position.set(-0.8, 3.6, 0);
        worldGroup.add(cylTopFlange);

        const cylGlass = new THREE.Mesh(
          new THREE.CylinderGeometry(1.15, 1.15, 3.2, 32, 1, true),
          new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.28,
            roughness: 0.08,
            depthWrite: false,
            side: THREE.FrontSide
          })
        );
        cylGlass.position.set(-0.8, 2.0, 0);
        cylGlass.renderOrder = 4;
        worldGroup.add(cylGlass);

        // Несучі колони маховика
        for (const zOff of [-0.95, 0.95]) {
          const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.11, 4.4, 14),
            new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.65, roughness: 0.35 })
          );
          pillar.position.set(-0.8, 2.4, zOff);
          worldGroup.add(pillar);
        }

        // Робочий газ усередині циліндра (змінює колір між ізотермами T₁ та T₂)
        this.gasVolumeMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(1.08, 1.08, 1, 28),
          new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.48,
            roughness: 0.3,
            depthWrite: false,
            side: THREE.FrontSide
          })
        );
        this.gasVolumeMesh.renderOrder = 2;
        worldGroup.add(this.gasVolumeMesh);

        // Молекули ідеального газу всередині робочого об'єму
        const molGeo = new THREE.SphereGeometry(0.065, 10, 10);
        this.molMat = new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xd97706,
          emissiveIntensity: 0.6
        });
        for (let i = 0; i < 22; i++) {
          const m = new THREE.Mesh(molGeo, this.molMat);
          worldGroup.add(m);
          this.gasMolecules.push({
            mesh: m,
            rx: (Math.random() - 0.5) * 1.4,
            rz: (Math.random() - 0.5) * 1.4,
            ryNorm: 0.12 + Math.random() * 0.76,
            phase: Math.random() * Math.PI * 2
          });
        }

        // Поршень з ущільнювальними компресійними кільцями
        this.pistonGroup = new THREE.Group();
        const pistonBody = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1, 1.1, 0.3, 28),
          new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.7, roughness: 0.28 })
        );
        pistonBody.castShadow = true;
        this.pistonGroup.add(pistonBody);

        for (const yRing of [-0.07, 0.07]) {
          const pRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.105, 0.022, 8, 32),
            new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.2 })
          );
          pRing.rotation.x = Math.PI / 2;
          pRing.position.y = yRing;
          this.pistonGroup.add(pRing);
        }
        worldGroup.add(this.pistonGroup);

        // Маховик зверху (x = -0.8, y = 4.6)
        this.flywheelGroup = new THREE.Group();
        this.flywheelGroup.position.set(-0.8, 4.6, 0);
        const wheelRim = new THREE.Mesh(
          new THREE.TorusGeometry(0.95, 0.12, 16, 40),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.25 })
        );
        this.flywheelGroup.add(wheelRim);
        for (let s = 0; s < 3; s++) {
          const spoke = new THREE.Mesh(
            new THREE.BoxGeometry(1.85, 0.1, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x78716c, metalness: 0.55 })
          );
          spoke.rotation.z = (s * Math.PI) / 3;
          this.flywheelGroup.add(spoke);
        }
        const crankPin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.07, 0.36, 12),
          new THREE.MeshStandardMaterial({ color: 0xfef3c7, metalness: 0.8 })
        );
        crankPin.rotation.x = Math.PI / 2;
        crankPin.position.set(0.65, 0, 0.16);
        this.flywheelGroup.add(crankPin);
        worldGroup.add(this.flywheelGroup);

        // 3D-шатун від поршня до пальця кривошипа маховика
        this.conRodMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 1, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x44403c, metalness: 0.75, roughness: 0.28 })
        );
        worldGroup.add(this.conRodMesh);

        this.arrowQ1 = new SmartVectorArrow('Q₁ (від нагрівника)', 0xb91c1c, '#b91c1c');
        this.arrowWorkA = new SmartVectorArrow('A = Q₁ − Q₂ (робота)', 0x166534, '#166534');
        this.arrowQ2 = new SmartVectorArrow('Q₂ (у холодильник)', 0x1d4ed8, '#1d4ed8');
      }

      syncVisuals() {
        this.updateVisuals();
      }

      reset() {
        this.phaseTriggered = false;
        this.particles.clear();
        this.updateVisuals();
      }

      update(dt) {
        if (Math.random() < 0.35) {
          this.particles.emit(new THREE.Vector3(-2.6, 1.8, 0), 1.8, 2, 0xd97706);
        }
        this.particles.update(dt);

        if (uiState.simTime > 1.8 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.carnot;
        const eta = Math.max(0.05, 1 - p.tempCold / p.tempHot);
        const workA = p.heatQ1 * eta;
        const q2 = p.heatQ1 - workA;

        const omega = p.rpmSpeed * Math.PI * 1.4;
        const angle = omega * uiState.simTime;
        this.flywheelGroup.rotation.z = -angle;

        const stroke = 0.65;
        const pistonY = 2.15 + stroke * Math.sin(angle);
        this.pistonGroup.position.set(-0.8, pistonY, 0);

        const gasH = Math.max(0.4, pistonY - 0.55);
        this.gasVolumeMesh.scale.set(1, gasH, 1);
        this.gasVolumeMesh.position.set(-0.8, 0.48 + gasH / 2, 0);

        // Колір газу плавно змінюється між гарячою ізотермою T₁ та холодною ізотермою T₂
        const cyclePhase = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const heatFactor = 0.5 + 0.5 * Math.cos(cyclePhase);
        this.gasVolumeMesh.material.color.setRGB(
          0.15 + 0.8 * heatFactor,
          0.35 + 0.2 * heatFactor,
          0.85 - 0.7 * heatFactor
        );

        // Тепловий рух молекул газу всередині робочого циліндра
        const thermalSpeed = 3.5 + 5.5 * heatFactor;
        this.gasMolecules.forEach(mol => {
          mol.mesh.visible = uiState.showParticles;
          const jitterX = 0.12 * Math.sin(uiState.simTime * thermalSpeed + mol.phase);
          const jitterY = 0.08 * Math.cos(uiState.simTime * thermalSpeed * 1.3 + mol.phase);
          const yPos = 0.56 + mol.ryNorm * (gasH - 0.16) + jitterY;
          mol.mesh.position.set(-0.8 + mol.rx * 0.55 + jitterX, yPos, mol.rz * 0.55);
        });

        // Оновлюємо 3D-шатун від поршневого пальця до кривошипа маховика
        const pStart = new THREE.Vector3(-0.8, pistonY + 0.14, 0.16);
        const pEnd = new THREE.Vector3(-0.8 + 0.65 * Math.cos(angle), 4.6 - 0.65 * Math.sin(angle), 0.16);
        const rodVec = new THREE.Vector3().subVectors(pEnd, pStart);
        const rodLen = rodVec.length();
        this.conRodMesh.position.copy(pStart).addScaledVector(rodVec, 0.5);
        this.conRodMesh.scale.set(1, rodLen, 1);
        this.conRodMesh.rotation.set(0, 0, Math.atan2(rodVec.y, rodVec.x) - Math.PI / 2);

        this.arrowQ1.update(
          new THREE.Vector3(-2.9, 1.8, 0),
          new THREE.Vector3(1, 0, 0),
          Math.min(2.3, p.heatQ1 * 0.013),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowWorkA.update(
          new THREE.Vector3(-0.8, pistonY + 0.2, 0),
          new THREE.Vector3(0, 1, 0),
          Math.min(2.4, workA * 0.022),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowQ2.update(
          new THREE.Vector3(0.5, 1.5, 0),
          new THREE.Vector3(1, 0, 0),
          Math.min(2.3, q2 * 0.016),
          uiState.showVectors,
          uiState.showLabels
        );

        const stageIndex = Math.floor((cyclePhase / (Math.PI * 2)) * 4);
        const stageNames = [
          '1→2 Ізотерм. розширення (T₁)',
          '2→3 Адіабатне розширення',
          '3→4 Ізотерм. стиснення (T₂)',
          '4→1 Адіабатне стиснення'
        ];

        updateEnergyUI(workA, p.heatQ1, q2, p.heatQ1, [
          { label: 'Термічний ККД η_Карно', val: `${(eta * 100).toFixed(1)} %` },
          { label: 'Корисна робота A', val: `${workA.toFixed(1)} Дж` },
          { label: 'Віддано холодильнику Q₂', val: `${q2.toFixed(1)} Дж` },
          { label: 'Такт циклу Карно', val: stageNames[stageIndex] || stageNames[0] }
        ]);
      }

      dispose() {
        this.arrowQ1.dispose();
        this.arrowWorkA.dispose();
        this.arrowQ2.dispose();
        this.particles.dispose();
      }
    }

    // ============================================================================
    // 11n. МОДУЛЬ § 24: ФОРМУЛА СТОКСА — РУХ КУЛІ У В’ЯЗКІЙ РІДИНІ
    // ============================================================================
    class StokesViscositySimulation {
      constructor() {
        this.topY = 4.6;
        this.bottomY = 0.65;
        this.ballY = this.topY;
        this.vy = 0;
        this.heatQ = 0;
        this.phaseTriggered = false;
        this.trailPts = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Підставка віскозиметра Стокса з юстувальними ніжками
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(1.95, 2.15, 0.28, 32),
          new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.55, metalness: 0.4 })
        );
        base.position.set(0, 0.14, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        for (let a = 0; a < 3; a++) {
          const ang = (a * Math.PI * 2) / 3;
          const foot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.22, 0.12, 16),
            new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.28 })
          );
          foot.position.set(Math.cos(ang) * 1.95, 0.06, Math.sin(ang) * 1.95);
          worldGroup.add(foot);
        }

        // Латунна верхня кришка-фланець з напрямною лійкою для центрування кульки
        const topCapRim = new THREE.Mesh(
          new THREE.TorusGeometry(1.5, 0.075, 14, 36),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.25 })
        );
        topCapRim.rotation.x = Math.PI / 2;
        topCapRim.position.set(0, 5.08, 0);
        worldGroup.add(topCapRim);

        const dropFunnel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.22, 0.38, 24, 1, true),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.75, roughness: 0.25, side: THREE.DoubleSide })
        );
        dropFunnel.position.set(0, 5.18, 0);
        worldGroup.add(dropFunnel);

        // Вертикальна вимірювальна стійка з міліметровою шкалою праворуч від циліндра
        const scalePost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.065, 0.065, 5.0, 14),
          new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.65, roughness: 0.3 })
        );
        scalePost.position.set(1.85, 2.6, 0);
        worldGroup.add(scalePost);

        for (let i = 0; i <= 16; i++) {
          const isMajor = i % 4 === 0;
          const tick = new THREE.Mesh(
            new THREE.BoxGeometry(isMajor ? 0.26 : 0.14, 0.025, 0.03),
            new THREE.MeshStandardMaterial({ color: isMajor ? 0xb91c1c : 0x292524 })
          );
          tick.position.set(1.72, 0.6 + i * 0.25, 0);
          worldGroup.add(tick);
        }

        // Висока скляна мензурка з бурштиновим гліцерином/маслом (без transmission pass, щоб не миготіло)
        this.liquidMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(1.42, 1.42, 4.48, 32),
          new THREE.MeshPhysicalMaterial({
            color: 0xf59e0b,
            emissive: 0xd97706,
            emissiveIntensity: 0.14,
            transparent: true,
            opacity: 0.44,
            roughness: 0.12,
            side: THREE.FrontSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
          })
        );
        this.liquidMesh.position.set(0, 2.55, 0);
        this.liquidMesh.renderOrder = 2;
        worldGroup.add(this.liquidMesh);

        // Верхній меніск в'язкої рідини
        const liquidTopDisk = new THREE.Mesh(
          new THREE.CircleGeometry(1.42, 32),
          new THREE.MeshPhysicalMaterial({
            color: 0xfbbf24,
            emissive: 0xd97706,
            emissiveIntensity: 0.22,
            transparent: true,
            opacity: 0.68,
            roughness: 0.08,
            depthWrite: false,
            side: THREE.DoubleSide
          })
        );
        liquidTopDisk.rotation.x = -Math.PI / 2;
        liquidTopDisk.position.set(0, 4.805, 0);
        liquidTopDisk.renderOrder = 3;
        worldGroup.add(liquidTopDisk);

        const glassWall = new THREE.Mesh(
          new THREE.CylinderGeometry(1.48, 1.48, 4.8, 32, 1, true),
          new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.24,
            roughness: 0.08,
            side: THREE.FrontSide,
            depthWrite: false
          })
        );
        glassWall.position.set(0, 2.68, 0);
        glassWall.renderOrder = 4;
        worldGroup.add(glassWall);

        // Мірні кільця-поділки на колбі віскозиметра
        for (let i = 1; i <= 4; i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.49, 0.024, 8, 36),
            new THREE.MeshBasicMaterial({ color: 0x78350f, transparent: true, opacity: 0.65 })
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(0, 0.6 + i * 0.95, 0);
          worldGroup.add(ring);
        }

        // Металева кулька, що падає у в'язкому середовищі
        this.sphereMesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 32, 32),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.78, roughness: 0.2 })
        );
        this.sphereMesh.castShadow = true;
        worldGroup.add(this.sphereMesh);

        this.wakeRingsGroup = new THREE.Group();
        worldGroup.add(this.wakeRingsGroup);

        this.arrowMg = new SmartVectorArrow('mg (тяжіння)', 0xb91c1c, '#b91c1c');
        this.arrowArch = new SmartVectorArrow('F_Архімеда', 0x1d4ed8, '#1d4ed8');
        this.arrowStokes = new SmartVectorArrow('F_Стокса = 6π·ηrv', 0xb45309, '#b45309');
        this.arrowVel = new SmartVectorArrow('v (швидкість)', 0x166534, '#166534');
      }

      syncVisuals() {
        this.updateVisuals();
      }

      reset() {
        this.ballY = this.topY;
        this.vy = 0;
        this.heatQ = 0;
        this.phaseTriggered = false;
        this.updateVisuals();
      }

      update(dt) {
        const p = sceneParams.viscosity;
        const rMeters = p.radiusR * 0.01;
        const g = 9.81;
        const vTerm = (2 * rMeters * rMeters * g * (p.rhoSphere - p.rhoFluid)) / (9 * p.viscosityEta);
        const tau = Math.max(0.18, (p.rhoSphere * rMeters * rMeters * 18) / (4.5 * p.viscosityEta));

        if (this.ballY > this.bottomY) {
          const dv = ((vTerm - this.vy) / tau) * dt;
          this.vy += dv;
          const dy = this.vy * dt * 12.0;
          this.ballY = Math.max(this.bottomY, this.ballY - dy);
          this.heatQ += (this.vy * 18) * dy * 1.8;
        } else if (!this.phaseTriggered) {
          this.vy = 0;
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }

        if (uiState.simTime > 1.8 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.viscosity;
        const rVisual = p.radiusR * 0.85;
        this.sphereMesh.scale.setScalar(rVisual);
        this.sphereMesh.position.set(0, this.ballY, 0);

        const rMeters = p.radiusR * 0.01;
        const vTerm = (2 * rMeters * rMeters * 9.81 * (p.rhoSphere - p.rhoFluid)) / (9 * p.viscosityEta);
        const ratioV = Math.min(1, this.vy / Math.max(0.001, vTerm));

        // Лінії ламінарного обтікання та кільця Стокса навколо кулі (без витоків пам'яті)
        clearGroup3D(this.wakeRingsGroup);
        if (uiState.showParticles && this.vy > 0.002) {
          for (let i = 1; i <= 3; i++) {
            const wake = new THREE.Mesh(
              new THREE.TorusGeometry(rVisual * (1.1 + i * 0.25), 0.018, 10, 28),
              new THREE.MeshBasicMaterial({
                color: 0xfef3c7,
                transparent: true,
                opacity: Math.max(0.1, 0.55 - i * 0.14)
              })
            );
            wake.rotation.x = Math.PI / 2;
            wake.position.set(0, this.ballY + i * 0.26, 0);
            this.wakeRingsGroup.add(wake);
          }

          // Чотири меридіональні лінії ламінарного обтікання
          for (let a = 0; a < 4; a++) {
            const ang = (a * Math.PI) / 2;
            const streamPts = [];
            for (let j = -8; j <= 8; j++) {
              const dy = (j / 8) * (rVisual * 2.4);
              const bulge = rVisual * 1.32 * Math.exp(-(dy * dy) / (rVisual * rVisual * 1.4)) + rVisual * 0.35;
              streamPts.push(
                new THREE.Vector3(
                  Math.cos(ang) * bulge,
                  this.ballY + dy,
                  Math.sin(ang) * bulge
                )
              );
            }
            this.wakeRingsGroup.add(
              new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(streamPts),
                new THREE.LineBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.6 })
              )
            );
          }
        }

        const pos = new THREE.Vector3(0, this.ballY, 0);
        const fgVisual = 1.9;
        const faVisual = fgVisual * (p.rhoFluid / p.rhoSphere);
        const fStokesVisual = (fgVisual - faVisual) * ratioV;

        this.arrowMg.update(
          pos,
          new THREE.Vector3(0, -1, 0),
          fgVisual,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowArch.update(
          pos.clone().add(new THREE.Vector3(-0.42, 0, 0)),
          new THREE.Vector3(0, 1, 0),
          faVisual,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowStokes.update(
          pos.clone().add(new THREE.Vector3(0.42, 0, 0)),
          new THREE.Vector3(0, 1, 0),
          fStokesVisual,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowVel.update(
          pos.clone().add(new THREE.Vector3(0.75, 0, 0)),
          new THREE.Vector3(0, -1, 0),
          Math.min(2.1, this.vy * 10.0),
          uiState.showVectors,
          uiState.showLabels
        );

        const hNorm = Math.max(0, this.ballY - this.bottomY);
        const ek = 0.5 * (this.vy * 18) * (this.vy * 18) * 2.5;
        const ep = hNorm * 3.0;
        const stokesForceN = 6 * Math.PI * p.viscosityEta * rMeters * this.vy;

        updateEnergyUI(ek, ep, this.heatQ, 12, [
          { label: 'Поточна швидкість v', val: `${this.vy.toFixed(3)} м/с` },
          { label: 'Гранична швидкість v_уст', val: `${vTerm.toFixed(3)} м/с` },
          { label: 'Сила Стокса F_c', val: `${stokesForceN.toFixed(3)} Н` },
          { label: 'Режим руху кулі', val: ratioV > 0.94 ? 'Усталений (a ≈ 0)' : 'Розгін (a > 0)' }
        ]);
      }

      dispose() {
        this.arrowMg.dispose();
        this.arrowArch.dispose();
        this.arrowStokes.dispose();
        this.arrowVel.dispose();
      }
    }

    // ============================================================================
    // 11o. МОДУЛЬ § 25: ЗАКОН КУЛОНА ТА ПОЛЕ ЕЛЕКТРИЧНОГО ДИПОЛЯ
    // ============================================================================
    class CoulombDipoleSimulation {
      constructor() {
        this.axisY = 2.3;
        this.testParamU = 0.16;
        this.phaseTriggered = false;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Ебонітова ізоляційна платформа електростатичного стенда з лінійкою відстані d
        const baseBoard = new THREE.Mesh(
          new THREE.BoxGeometry(8.6, 0.22, 2.8),
          new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.55, metalness: 0.35 })
        );
        baseBoard.position.set(0, 0.11, 0);
        baseBoard.receiveShadow = true;
        worldGroup.add(baseBoard);

        const scaleStrip = new THREE.Mesh(
          new THREE.BoxGeometry(7.6, 0.04, 0.28),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.65, roughness: 0.3 })
        );
        scaleStrip.position.set(0, 0.23, 0.95);
        worldGroup.add(scaleStrip);

        // Високовольтні ребристі керамічні ізолятори для заряджених куль
        this.leftStand = this.createInsulatorStand();
        this.rightStand = this.createInsulatorStand();
        worldGroup.add(this.leftStand);
        worldGroup.add(this.rightStand);

        // Позитивний заряд +q₁ (червона сфера ліворуч з 3D-символом «+») та негативний заряд q₂ (синя сфера праворуч з «−»)
        this.sphereQ1 = new THREE.Group();
        const q1Core = new THREE.Mesh(
          new THREE.SphereGeometry(0.48, 32, 32),
          new THREE.MeshPhysicalMaterial({ color: 0xdc2626, roughness: 0.22, metalness: 0.25, clearcoat: 0.7 })
        );
        q1Core.castShadow = true;
        this.sphereQ1.add(q1Core);
        const q1Halo = new THREE.Mesh(
          new THREE.SphereGeometry(0.6, 24, 24),
          new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.18 })
        );
        this.sphereQ1.add(q1Halo);
        const signMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const plusH = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.065, 0.065), signMat);
        const plusV = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.28, 0.065), signMat);
        plusH.position.set(0, 0, 0.5);
        plusV.position.set(0, 0, 0.5);
        this.sphereQ1.add(plusH, plusV);
        worldGroup.add(this.sphereQ1);

        this.sphereQ2 = new THREE.Group();
        const q2Core = new THREE.Mesh(
          new THREE.SphereGeometry(0.48, 32, 32),
          new THREE.MeshPhysicalMaterial({ color: 0x1d4ed8, roughness: 0.22, metalness: 0.25, clearcoat: 0.7 })
        );
        q2Core.castShadow = true;
        this.sphereQ2.add(q2Core);
        const q2Halo = new THREE.Mesh(
          new THREE.SphereGeometry(0.6, 24, 24),
          new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.18 })
        );
        this.sphereQ2.add(q2Halo);
        const minusH = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.065, 0.065), signMat);
        minusH.position.set(0, 0, 0.5);
        this.sphereQ2.add(minusH);
        worldGroup.add(this.sphereQ2);

        // Пробний позитивний заряд q₀, що рухається вздовж силової лінії поля
        this.testChargeMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 24, 24),
          new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0xd97706,
            emissiveIntensity: 0.65,
            roughness: 0.2
          })
        );
        worldGroup.add(this.testChargeMesh);

        this.fieldLinesGroup = new THREE.Group();
        worldGroup.add(this.fieldLinesGroup);

        this.arrowF12 = new SmartVectorArrow('F_Кулона (на q₁)', 0xb91c1c, '#b91c1c');
        this.arrowF21 = new SmartVectorArrow('F_Кулона (на q₂)', 0x1d4ed8, '#1d4ed8');
        this.arrowETest = new SmartVectorArrow('F₀ = q₀·E (поле)', 0x166534, '#166534');
      }

      createInsulatorStand() {
        const g = new THREE.Group();
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.13, this.axisY, 16),
          new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.45, metalness: 0.35 })
        );
        g.add(rod);
        for (let i = -2; i <= 2; i++) {
          const rib = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.25, 0.08, 18),
            new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.35, metalness: 0.25 })
          );
          rib.position.y = i * 0.32;
          g.add(rib);
        }
        return g;
      }

      rebuildFieldLines() {
        clearGroup3D(this.fieldLinesGroup);
        const p = sceneParams.coulomb;
        const halfD = p.distanceD / 2;
        const p1 = new THREE.Vector3(-halfD, this.axisY, 0);
        const p2 = new THREE.Vector3(halfD, this.axisY, 0);

        // Будуємо об'ємні 3D-дуги силових ліній електричного диполя у кількох меридіональних площинах
        this.centralArcCurve = null;

        // Осьова лінія між +q₁ та -q₂
        const axisCurve = new THREE.LineCurve3(p1, p2);
        this.fieldLinesGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(axisCurve.getPoints(24)),
            new THREE.LineBasicMaterial({ color: 0xb45309, transparent: true, opacity: 0.75 })
          )
        );

        const radii = [0.95, 1.85];
        const azimuths = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, Math.PI / 4, (3 * Math.PI) / 4];
        const coneGeo = new THREE.ConeGeometry(0.075, 0.22, 10);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0xd97706 });

        radii.forEach((rArc, rIdx) => {
          azimuths.forEach((phi, aIdx) => {
            const dy = rArc * Math.cos(phi);
            const dz = rArc * Math.sin(phi);
            const curve = new THREE.CatmullRomCurve3([
              p1,
              new THREE.Vector3(-halfD * 0.45, this.axisY + dy * 0.85, dz * 0.85),
              new THREE.Vector3(0, this.axisY + dy, dz),
              new THREE.Vector3(halfD * 0.45, this.axisY + dy * 0.85, dz * 0.85),
              p2
            ]);
            if (rIdx === 0 && aIdx === 0) this.centralArcCurve = curve;

            const pts = curve.getPoints(44);
            const line = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(pts),
              new THREE.LineBasicMaterial({
                color: 0xb45309,
                transparent: true,
                opacity: rIdx === 0 ? 0.72 : 0.48
              })
            );
            this.fieldLinesGroup.add(line);

            // Стрілка напрямку вектора E посередині силової лінії (від +q₁ до -q₂)
            if (aIdx < 4) {
              const midPt = curve.getPoint(0.5);
              const midTan = curve.getTangent(0.5);
              const dirCone = new THREE.Mesh(coneGeo, coneMat);
              dirCone.position.copy(midPt);
              dirCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), midTan);
              this.fieldLinesGroup.add(dirCone);
            }
          });
        });
      }

      syncVisuals() {
        this.rebuildFieldLines();
        this.updateVisuals();
      }

      reset() {
        this.testParamU = 0.14;
        this.phaseTriggered = false;
        this.rebuildFieldLines();
        this.updateVisuals();
      }

      update(dt) {
        const p = sceneParams.coulomb;
        const speedU = (0.28 * (Math.abs(p.q1) + Math.abs(p.q2)) * p.testChargeQ) / p.distanceD;
        this.testParamU += speedU * dt;
        if (this.testParamU > 0.86) {
          this.testParamU = 0.14;
        }

        if (uiState.simTime > 1.6 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.coulomb;
        const halfD = p.distanceD / 2;

        this.leftStand.position.set(-halfD, this.axisY / 2, 0);
        this.rightStand.position.set(halfD, this.axisY / 2, 0);
        this.sphereQ1.position.set(-halfD, this.axisY, 0);
        this.sphereQ2.position.set(halfD, this.axisY, 0);

        const s1 = 0.78 + Math.abs(p.q1) * 0.08;
        const s2 = 0.78 + Math.abs(p.q2) * 0.08;
        this.sphereQ1.scale.setScalar(s1);
        this.sphereQ2.scale.setScalar(s2);

        this.fieldLinesGroup.visible = uiState.showTrails;
        this.testChargeMesh.visible = uiState.showParticles;

        const kConst = 8.99;
        const fCoulomb = (kConst * Math.abs(p.q1 * p.q2)) / (p.distanceD * p.distanceD);
        const fLen = Math.min(2.3, fCoulomb * 0.42 + 0.35);

        this.arrowF12.update(
          new THREE.Vector3(-halfD + 0.35, this.axisY, 0),
          new THREE.Vector3(1, 0, 0),
          fLen,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowF21.update(
          new THREE.Vector3(halfD - 0.35, this.axisY, 0),
          new THREE.Vector3(-1, 0, 0),
          fLen,
          uiState.showVectors,
          uiState.showLabels
        );

        if (this.centralArcCurve) {
          const testPos = this.centralArcCurve.getPoint(this.testParamU);
          const tangent = this.centralArcCurve.getTangent(this.testParamU);
          this.testChargeMesh.position.copy(testPos);

          this.arrowETest.update(
            testPos,
            tangent,
            Math.min(2.2, 0.7 + p.testChargeQ * 0.55),
            uiState.showVectors,
            uiState.showLabels
          );
        }

        const eMid = (4 * kConst * (Math.abs(p.q1) + Math.abs(p.q2))) / (p.distanceD * p.distanceD);
        const wPotential = (kConst * Math.abs(p.q1 * p.q2)) / p.distanceD;
        const ekTest = this.testParamU * p.testChargeQ * 6.5;

        updateEnergyUI(ekTest, wPotential, fCoulomb, Math.max(15, wPotential + fCoulomb + 8), [
          { label: 'Сила Кулона F_C', val: `${fCoulomb.toFixed(2)} мН` },
          { label: 'Поле в центрі E_центр', val: `${eMid.toFixed(1)} кВ/м` },
          { label: 'Енергія взаємодії |W|', val: `${wPotential.toFixed(2)} мДж` },
          { label: 'Сила на пробний заряд F₀', val: `${(eMid * p.testChargeQ * 0.1).toFixed(2)} мН` }
        ]);
      }

      dispose() {
        this.arrowF12.dispose();
        this.arrowF21.dispose();
        this.arrowETest.dispose();
      }
    }

    // ============================================================================
    // 11p. МОДУЛЬ § 26: КОЛИВАЛЬНИЙ КОНТУР ТОМПСОНА (LC / RLC)
    // ============================================================================
    class ThomsonRLCSimulation {
      constructor() {
        this.axisY = 2.2;
        this.phaseTriggered = false;
        this.wireCarriers = [];
        this.eFieldPillars = [];
        this.bFieldLoops = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Діелектрична плата контуру на латунних стійках
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(10.4, 0.24, 4.8),
          new THREE.MeshStandardMaterial({ color: 0xd6c7b2, roughness: 0.78 })
        );
        board.position.set(0, 0.12, 0);
        board.receiveShadow = true;
        worldGroup.add(board);

        // Ліворуч (x = -3.0): Плоский конденсатор C з двома обкладками на ізоляторах
        const plateGeo = new THREE.BoxGeometry(1.95, 0.14, 1.95);
        this.topPlateMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.55, roughness: 0.28 });
        this.botPlateMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.55, roughness: 0.28 });

        this.topPlate = new THREE.Mesh(plateGeo, this.topPlateMat);
        this.topPlate.position.set(-3.0, 2.9, 0);
        this.topPlate.castShadow = true;
        worldGroup.add(this.topPlate);

        this.botPlate = new THREE.Mesh(plateGeo, this.botPlateMat);
        this.botPlate.position.set(-3.0, 1.3, 0);
        this.botPlate.castShadow = true;
        worldGroup.add(this.botPlate);

        for (const zOff of [-0.75, 0.75]) {
          const capSupport = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.11, 1.1, 12),
            new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.6 })
          );
          capSupport.position.set(-3.0, 0.7, zOff);
          worldGroup.add(capSupport);
        }

        // Світіння та 9 силових ліній електричного поля E всередині конденсатора
        this.capFieldVolume = new THREE.Mesh(
          new THREE.BoxGeometry(1.75, 1.45, 1.75),
          new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.24 })
        );
        this.capFieldVolume.position.set(-3.0, 2.1, 0);
        worldGroup.add(this.capFieldVolume);

        const eLineGeo = new THREE.CylinderGeometry(0.022, 0.022, 1.42, 8);
        this.eLineMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.7 });
        for (const dx of [-0.55, 0, 0.55]) {
          for (const dz of [-0.55, 0, 0.55]) {
            const pLine = new THREE.Mesh(eLineGeo, this.eLineMat);
            pLine.position.set(-3.0 + dx, 2.1, dz);
            worldGroup.add(pLine);
            this.eFieldPillars.push(pLine);
          }
        }

        // Праворуч (x = +3.0): Мідна котушка індуктивності L з текстолітовими каркасними щоками
        for (const yFlange of [1.1, 3.1]) {
          const bobbinFlange = new THREE.Mesh(
            new THREE.CylinderGeometry(1.02, 1.02, 0.08, 28),
            new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.5, metalness: 0.35 })
          );
          bobbinFlange.position.set(3.0, yFlange, 0);
          worldGroup.add(bobbinFlange);
        }

        const helixPts = [];
        const turns = 9;
        for (let i = 0; i <= turns * 24; i++) {
          const u = i / (turns * 24);
          const ang = u * turns * Math.PI * 2;
          helixPts.push(
            new THREE.Vector3(3.0 + 0.85 * Math.cos(ang), 1.15 + u * 1.9, 0.85 * Math.sin(ang))
          );
        }
        const coilCurve = new THREE.CatmullRomCurve3(helixPts);
        const coilMesh = new THREE.Mesh(
          new THREE.TubeGeometry(coilCurve, 180, 0.065, 12, false),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.78, roughness: 0.25 })
        );
        coilMesh.castShadow = true;
        worldGroup.add(coilMesh);

        // Світіння та замкнені силові лінії магнітного поля B котушки L
        this.indFieldVolume = new THREE.Mesh(
          new THREE.CylinderGeometry(0.72, 0.72, 2.0, 24),
          new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.25 })
        );
        this.indFieldVolume.position.set(3.0, 2.1, 0);
        worldGroup.add(this.indFieldVolume);

        this.bLoopMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 });
        for (const phi of [0, Math.PI / 2]) {
          const bLoop = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.02, 10, 36), this.bLoopMat);
          bLoop.scale.set(0.68, 1.38, 1);
          bLoop.rotation.y = phi;
          bLoop.position.set(3.0, 2.1, 0);
          worldGroup.add(bLoop);
          this.bFieldLoops.push(bLoop);
        }

        // З'єднувальні мідні шини контуру з клемами
        const topBus = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 6.0, 12),
          new THREE.MeshStandardMaterial({ color: 0x57534e, metalness: 0.72, roughness: 0.3 })
        );
        topBus.rotation.z = Math.PI / 2;
        topBus.position.set(0, 3.05, 0);
        worldGroup.add(topBus);

        const botBus = topBus.clone();
        botBus.position.set(0, 1.15, 0);
        worldGroup.add(botBus);

        // Резистор R на верхній шині (x = 0, y = 3.05) з кольоровими маркувальними кільцями
        this.resistorMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.24, 1.35, 20),
          new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.42 })
        );
        this.resistorMesh.rotation.z = Math.PI / 2;
        this.resistorMesh.position.set(0, 3.05, 0);
        worldGroup.add(this.resistorMesh);

        const bandColors = [0xdc2626, 0xf59e0b, 0x16a34a, 0xd97706];
        bandColors.forEach((bHex, idx) => {
          const band = new THREE.Mesh(
            new THREE.CylinderGeometry(0.248, 0.248, 0.08, 20),
            new THREE.MeshStandardMaterial({ color: bHex, roughness: 0.3 })
          );
          band.rotation.z = Math.PI / 2;
          band.position.set(-0.42 + idx * 0.28, 3.05, 0);
          worldGroup.add(band);
        });

        // Стрілковий гальванометр/вольтметр на задньому плані плати (z = -1.55)
        const meterBox = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 1.25, 0.36),
          new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.5, metalness: 0.4 })
        );
        meterBox.position.set(0, 0.86, -1.55);
        worldGroup.add(meterBox);

        const meterFace = new THREE.Mesh(
          new THREE.PlaneGeometry(1.65, 0.95),
          new THREE.MeshBasicMaterial({ color: 0xfef3c7 })
        );
        meterFace.position.set(0, 0.88, -1.36);
        worldGroup.add(meterFace);

        this.needleU = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.68, 0.02),
          new THREE.MeshBasicMaterial({ color: 0xdc2626 })
        );
        this.needleU.position.set(0, 0.55, -1.34);
        worldGroup.add(this.needleU);

        this.needleI = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.62, 0.02),
          new THREE.MeshBasicMaterial({ color: 0x0284c7 })
        );
        this.needleI.position.set(0, 0.55, -1.33);
        worldGroup.add(this.needleI);

        // Носії заряду вздовж замкненого контуру
        this.loopCurve = new THREE.CatmullRomCurve3(
          [
            new THREE.Vector3(-3.0, 3.05, 0),
            new THREE.Vector3(3.0, 3.05, 0),
            new THREE.Vector3(3.0, 1.15, 0),
            new THREE.Vector3(-3.0, 1.15, 0)
          ],
          true
        );
        const carrierGeo = new THREE.SphereGeometry(0.095, 14, 14);
        const carrierMat = new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xd97706,
          emissiveIntensity: 0.7
        });
        this.carrierPhase = 0;
        for (let i = 0; i < 18; i++) {
          const m = new THREE.Mesh(carrierGeo, carrierMat);
          worldGroup.add(m);
          this.wireCarriers.push({ mesh: m, baseS: i / 18 });
        }

        this.arrowE = new SmartVectorArrow('E (поле конденсатора)', 0xb91c1c, '#b91c1c');
        this.arrowB = new SmartVectorArrow('B (магнітне поле L)', 0x1d4ed8, '#1d4ed8');
        this.arrowI = new SmartVectorArrow('I(t) (струм контуру)', 0x166534, '#166534');
      }

      syncVisuals() {
        this.updateVisuals();
      }

      reset() {
        this.carrierPhase = 0;
        this.phaseTriggered = false;
        this.updateVisuals();
      }

      update(dt) {
        if (uiState.simTime > 1.8 && !this.phaseTriggered) {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateVisuals();
      }

      updateVisuals() {
        const p = sceneParams.rlccircuit;
        const omega0 = 1 / Math.sqrt(p.inductanceL * p.capacitanceC * 0.01);
        const gamma = (p.resistanceR / (2 * p.inductanceL)) * 1.2;
        const t = uiState.simTime;

        const env = Math.exp(-gamma * t);
        const cosVal = env * Math.cos(omega0 * t);
        const sinVal = -env * Math.sin(omega0 * t);

        const uCap = p.voltageU0 * cosVal;
        const iMax = p.voltageU0 * Math.sqrt(p.capacitanceC / p.inductanceL);
        const iCurr = iMax * sinVal;

        // Візуалізація електричного поля E між обкладками C та магнітного поля B у котушці L
        this.capFieldVolume.material.opacity = Math.min(0.68, 0.04 + Math.abs(cosVal) * 0.52);
        this.capFieldVolume.material.color.setHex(cosVal >= 0 ? 0xef4444 : 0x3b82f6);
        this.topPlateMat.color.setHex(cosVal >= 0 ? 0xb91c1c : 0x1d4ed8);
        this.botPlateMat.color.setHex(cosVal >= 0 ? 0x1d4ed8 : 0xb91c1c);

        this.eLineMat.opacity = Math.min(0.9, 0.08 + Math.abs(cosVal) * 0.78);
        this.indFieldVolume.material.opacity = Math.min(0.68, 0.04 + Math.abs(sinVal) * 0.52);
        this.bLoopMat.opacity = Math.min(0.88, 0.06 + Math.abs(sinVal) * 0.75);

        // Відхилення стрілок гальванометра U(t) та I(t) (зсув фаз π/2)
        this.needleU.rotation.z = -cosVal * 0.75;
        this.needleI.rotation.z = -sinVal * 0.75;

        // Коливання носіїв заряду в шинах контуру
        const dispS = 0.14 * cosVal;
        this.wireCarriers.forEach(c => {
          c.mesh.visible = uiState.showParticles;
          let u = (c.baseS + dispS) % 1;
          if (u < 0) u += 1;
          c.mesh.position.copy(this.loopCurve.getPoint(u));
        });

        this.arrowE.update(
          new THREE.Vector3(-3.0, 2.1, 0),
          new THREE.Vector3(0, cosVal >= 0 ? -1 : 1, 0),
          Math.min(2.1, Math.abs(cosVal) * 1.85),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowB.update(
          new THREE.Vector3(3.0, 2.1, 0),
          new THREE.Vector3(0, sinVal >= 0 ? 1 : -1, 0),
          Math.min(2.1, Math.abs(sinVal) * 1.85),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowI.update(
          new THREE.Vector3(0, 3.45, 0),
          new THREE.Vector3(sinVal >= 0 ? 1 : -1, 0, 0),
          Math.min(2.2, Math.abs(sinVal) * 1.9),
          uiState.showVectors,
          uiState.showLabels
        );

        const wTotal0 = 0.5 * p.capacitanceC * p.voltageU0 * p.voltageU0 * 0.1;
        const wE = wTotal0 * cosVal * cosVal;
        const wB = wTotal0 * sinVal * sinVal;
        const qHeat = Math.max(0, wTotal0 - (wE + wB));
        const periodT = (2 * Math.PI) / omega0;

        updateEnergyUI(wB, wE, qHeat, wTotal0, [
          { label: 'Напруга конденсатора U(t)', val: `${uCap.toFixed(2)} В` },
          { label: 'Струм у котушці I(t)', val: `${iCurr.toFixed(2)} А` },
          { label: 'Період Томпсона T', val: `${periodT.toFixed(2)} с` },
          { label: 'Енергія W_E / W_B', val: `${wE.toFixed(1)} / ${wB.toFixed(1)} Дж` }
        ]);
      }

      dispose() {
        this.arrowE.dispose();
        this.arrowB.dispose();
        this.arrowI.dispose();
      }
    }

    // ============================================================================
    // 11q. МОДУЛЬ § 27: МАШИНА АТВУДА — ДИНАМІКА ЗВ’ЯЗАНИХ ТІЛ ТА ІНЕРЦІЯ БЛОКА
    // ============================================================================
    class AtwoodMachineSimulation {
      constructor() {
        this.yOffset = 0;
        this.vel = 0;
        this.pulleyAngle = 0;
        this.phaseTriggered = false;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Масивна чавунна основа лабораторної колони машини Атвуда
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(4.4, 0.32, 2.8),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.45, roughness: 0.5 })
        );
        base.position.set(0, 0.16, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Латунні ніжки-домкрати та гумові буфери під вантажами
        [-1.9, 1.9].forEach(x => {
          [-1.1, 1.1].forEach(z => {
            const foot = new THREE.Mesh(
              new THREE.CylinderGeometry(0.16, 0.22, 0.12, 16),
              new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.28 })
            );
            foot.position.set(x, 0.06, z);
            worldGroup.add(foot);
          });
        });

        // Вертикальна стійка-колона з міліметровою шкалою
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 6.6, 0.28),
          new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.55, roughness: 0.38 })
        );
        pillar.position.set(0, 3.45, -0.55);
        pillar.castShadow = true;
        worldGroup.add(pillar);

        // Поділки шкали вздовж колони
        for (let i = 0; i <= 24; i++) {
          const isMajor = i % 4 === 0;
          const tick = new THREE.Mesh(
            new THREE.BoxGeometry(isMajor ? 0.24 : 0.14, 0.025, 0.02),
            new THREE.MeshBasicMaterial({ color: isMajor ? 0xfef3c7 : 0x94a3b8 })
          );
          tick.position.set(0, 0.7 + i * 0.22, -0.4);
          worldGroup.add(tick);
        }

        // Верхній кронштейн-підшипник для осі блока
        const bracket = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.36, 1.15),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.35 })
        );
        bracket.position.set(0, 6.65, -0.12);
        worldGroup.add(bracket);

        const axle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 1.1, 16),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 })
        );
        axle.rotation.x = Math.PI / 2;
        axle.position.set(0, 6.45, 0.05);
        worldGroup.add(axle);

        // Група обертового блока (шків зі спицями та жолобом)
        this.pulleyGroup = new THREE.Group();
        this.pulleyGroup.position.set(0, 6.45, 0.15);
        worldGroup.add(this.pulleyGroup);

        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 0.24, 24),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.78, roughness: 0.24 })
        );
        hub.rotation.x = Math.PI / 2;
        this.pulleyGroup.add(hub);

        this.pulleyRim = new THREE.Mesh(
          new THREE.TorusGeometry(0.8, 0.09, 16, 42),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.75, roughness: 0.26 })
        );
        this.pulleyRim.castShadow = true;
        this.pulleyGroup.add(this.pulleyRim);

        this.pulleyWeb = new THREE.Mesh(
          new THREE.CylinderGeometry(0.76, 0.76, 0.1, 32),
          new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6, roughness: 0.35 })
        );
        this.pulleyWeb.rotation.x = Math.PI / 2;
        this.pulleyGroup.add(this.pulleyWeb);

        for (let s = 0; s < 6; s++) {
          const ang = (s * Math.PI) / 3;
          const spoke = new THREE.Mesh(
            new THREE.BoxGeometry(1.42, 0.08, 0.16),
            new THREE.MeshStandardMaterial({ color: 0xfef3c7, metalness: 0.5, roughness: 0.35 })
          );
          spoke.rotation.z = ang;
          this.pulleyGroup.add(spoke);
        }

        // Ліва і права вітки нитки та дуга обхвату шківа
        const cordMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 });
        this.leftCord = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 10), cordMat);
        this.rightCord = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 10), cordMat);
        this.topCordArc = new THREE.Mesh(
          new THREE.TorusGeometry(0.8, 0.022, 10, 32, Math.PI),
          cordMat
        );
        this.topCordArc.position.set(0, 6.45, 0.15);
        worldGroup.add(this.leftCord, this.rightCord, this.topCordArc);

        // Пружні гумові демпфери на станині під обома вантажами
        const padMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 });
        this.leftBufferPad = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.1, 24), padMat);
        this.rightBufferPad = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.1, 24), padMat);
        worldGroup.add(this.leftBufferPad, this.rightBufferPad);

        // Вантажі m₁ (лівий, мідно-бронзовий) та m₂ (правий, сталево-синій) зі змінними шайбами
        this.weight1Group = new THREE.Group();
        const cyl1 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.78, 28),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.26 })
        );
        cyl1.castShadow = true;
        const hook1 = new THREE.Mesh(
          new THREE.TorusGeometry(0.11, 0.028, 12, 20),
          new THREE.MeshStandardMaterial({ color: 0xfde68a, metalness: 0.8, roughness: 0.2 })
        );
        hook1.position.y = 0.45;
        this.weight1Group.add(cyl1, hook1);
        worldGroup.add(this.weight1Group);

        this.weight2Group = new THREE.Group();
        const cyl2 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.38, 0.38, 0.68, 28),
          new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.68, roughness: 0.28 })
        );
        cyl2.castShadow = true;
        const hook2 = new THREE.Mesh(
          new THREE.TorusGeometry(0.11, 0.028, 12, 20),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 })
        );
        hook2.position.y = 0.40;
        this.weight2Group.add(cyl2, hook2);
        worldGroup.add(this.weight2Group);

        // Маркер початкового рівня рівноваги y₀ = 3.4 м
        const refBar = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 0.025, 0.025),
          new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.55 })
        );
        refBar.position.set(0, 3.4, 0.15);
        worldGroup.add(refBar);
        this.refBar = refBar;

        this.arrowT1 = new SmartVectorArrow('T₁ (натяг лівої)', 0x0284c7, '#0284c7');
        this.arrowT2 = new SmartVectorArrow('T₂ (натяг правої)', 0x0284c7, '#0284c7');
        this.arrowMg1 = new SmartVectorArrow('m₁g (тягар 1)', 0xdc2626, '#dc2626');
        this.arrowMg2 = new SmartVectorArrow('m₂g (тягар 2)', 0xdc2626, '#dc2626');
      }

      syncVisuals() {
        this.syncMeshes();
        this.updateUI();
      }

      reset() {
        this.yOffset = 0;
        this.vel = 0;
        this.pulleyAngle = 0;
        this.phaseTriggered = false;
        this.syncMeshes();
        this.updateUI();
      }

      getAccAndTensions() {
        const p = sceneParams.atwood;
        const g = 9.81;
        const mEff = p.mass1 + p.mass2 + 0.5 * p.pulleyMass;
        const acc = ((p.mass1 - p.mass2) * g) / mEff;
        const T1 = p.mass1 * (g - acc);
        const T2 = p.mass2 * (g + acc);
        return { acc, T1, T2 };
      }

      syncMeshes() {
        const p = sceneParams.atwood;
        const R = p.pulleyRadius;
        const scaleR = R / 0.8;
        this.pulleyGroup.scale.set(scaleR, scaleR, 1 + p.pulleyMass * 0.22);
        this.pulleyGroup.rotation.z = this.pulleyAngle;
        this.topCordArc.scale.set(scaleR, scaleR, 1);
        this.leftBufferPad.position.set(-R, 0.37, 0.15);
        this.rightBufferPad.position.set(R, 0.37, 0.15);

        const yMid = 3.4;
        const y1 = yMid - this.yOffset;
        const y2 = yMid + this.yOffset;

        const s1 = 0.78 + p.mass1 * 0.11;
        const s2 = 0.78 + p.mass2 * 0.11;
        this.weight1Group.scale.set(s1, s1, s1);
        this.weight2Group.scale.set(s2, s2, s2);

        this.weight1Group.position.set(-R, y1, 0.15);
        this.weight2Group.position.set(R, y2, 0.15);

        const topY = 6.45;
        const len1 = Math.max(0.2, topY - (y1 + 0.4 * s1));
        this.leftCord.scale.set(1, len1, 1);
        this.leftCord.position.set(-R, topY - len1 * 0.5, 0.15);

        const len2 = Math.max(0.2, topY - (y2 + 0.36 * s2));
        this.rightCord.scale.set(1, len2, 1);
        this.rightCord.position.set(R, topY - len2 * 0.5, 0.15);

        this.refBar.visible = uiState.showTrails;
      }

      update(dt) {
        const p = sceneParams.atwood;
        const { acc } = this.getAccAndTensions();
        const maxTravel = 2.35;

        if (Math.abs(this.yOffset) < maxTravel || (this.yOffset * acc < 0)) {
          this.vel += acc * dt;
          this.yOffset += this.vel * dt;
          if (Math.abs(this.yOffset) >= maxTravel) {
            this.yOffset = Math.sign(this.yOffset) * maxTravel;
            this.vel = 0;
            if (!this.phaseTriggered && uiState.phase === 'test') {
              this.phaseTriggered = true;
              transitionToPhase('explain');
            }
          }
          this.pulleyAngle = this.yOffset / p.pulleyRadius;
        }
        if (Math.abs(acc) < 0.01 && uiState.simTime > 2.0 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }

        this.syncMeshes();
        this.updateUI();
      }

      updateUI() {
        const p = sceneParams.atwood;
        const g = 9.81;
        const R = p.pulleyRadius;
        const { acc, T1, T2 } = this.getAccAndTensions();
        const y1 = 3.4 - this.yOffset;
        const y2 = 3.4 + this.yOffset;

        this.arrowT1.update(
          new THREE.Vector3(-R, y1 + 0.48, 0.15),
          new THREE.Vector3(0, 1, 0),
          Math.min(2.2, T1 * 0.055),
          uiState.showVectors,
          uiState.showLabels
        );
        this.arrowMg1.update(
          new THREE.Vector3(-R, y1 - 0.35, 0.15),
          new THREE.Vector3(0, -1, 0),
          Math.min(2.2, p.mass1 * g * 0.055),
          uiState.showVectors,
          uiState.showLabels
        );
        this.arrowT2.update(
          new THREE.Vector3(R, y2 + 0.45, 0.15),
          new THREE.Vector3(0, 1, 0),
          Math.min(2.2, T2 * 0.055),
          uiState.showVectors,
          uiState.showLabels
        );
        this.arrowMg2.update(
          new THREE.Vector3(R, y2 - 0.35, 0.15),
          new THREE.Vector3(0, -1, 0),
          Math.min(2.2, p.mass2 * g * 0.055),
          uiState.showVectors,
          uiState.showLabels
        );

        const mEff = p.mass1 + p.mass2 + 0.5 * p.pulleyMass;
        const ek = 0.5 * mEff * this.vel * this.vel;
        const epDrop = Math.max(0, Math.abs(p.mass1 - p.mass2) * g * (2.35 - Math.abs(this.yOffset)));
        const eTot = Math.max(0.5, Math.abs(p.mass1 - p.mass2) * g * 2.35);
        const qPad = Math.max(0, eTot - ek - epDrop);

        updateEnergyUI(ek, epDrop, qPad, eTot, [
          { label: 'Прискорення a', val: `${acc.toFixed(2)} м/с²` },
          { label: 'Натяг лівої нитки T₁', val: `${T1.toFixed(1)} Н` },
          { label: 'Натяг правої нитки T₂', val: `${T2.toFixed(1)} Н` },
          { label: 'Швидкість вантажів |v|', val: `${Math.abs(this.vel).toFixed(2)} м/с` }
        ]);
      }

      dispose() {
        this.arrowT1.dispose();
        this.arrowT2.dispose();
        this.arrowMg1.dispose();
        this.arrowMg2.dispose();
      }
    }

    // ============================================================================
    // 11r. МОДУЛЬ § 28: СИЛА КОРІОЛІСА НА ОБЕРТОВІЙ ПЛАТФОРМІ
    // ============================================================================
    class FoucaultCoriolisSimulation {
      constructor() {
        this.diskAngle = 0;
        this.ballDist = 0;
        this.phaseTriggered = false;
        this.inertialPts = [];
        this.rotatingLocalPts = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Масивний лабораторний подіум для обертової платформи
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(4.4, 4.6, 0.35, 48),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.45, roughness: 0.55 })
        );
        base.position.set(0, 0.175, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Обертова платформа з меридіанною координатною сіткою
        this.turntableGroup = new THREE.Group();
        this.turntableGroup.position.set(0, 0.48, 0);
        worldGroup.add(this.turntableGroup);

        const platter = new THREE.Mesh(
          new THREE.CylinderGeometry(4.0, 4.05, 0.22, 64),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.35, roughness: 0.45 })
        );
        platter.receiveShadow = true;
        this.turntableGroup.add(platter);

        const brassRim = new THREE.Mesh(
          new THREE.TorusGeometry(4.02, 0.08, 16, 64),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.78, roughness: 0.25 })
        );
        brassRim.rotation.x = Math.PI / 2;
        brassRim.position.y = 0.08;
        this.turntableGroup.add(brassRim);

        // Радіальні лінії (меридіани) та концентричні паралелі на диску
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI) / 6;
          const spoke = new THREE.Mesh(
            new THREE.BoxGeometry(7.85, 0.015, i === 0 ? 0.065 : 0.025),
            new THREE.MeshBasicMaterial({ color: i === 0 ? 0x38bdf8 : 0x64748b })
          );
          spoke.position.y = 0.115;
          spoke.rotation.y = ang;
          this.turntableGroup.add(spoke);
        }

        [1.3, 2.6, 3.8].forEach(rad => {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(rad - 0.025, rad + 0.025, 48),
            new THREE.MeshBasicMaterial({ color: 0x475569, side: THREE.DoubleSide })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.116;
          this.turntableGroup.add(ring);
        });

        // Пружинна гармата в центрі платформи
        const launcher = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.34, 0.35, 24),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.28 })
        );
        launcher.position.y = 0.26;
        this.turntableGroup.add(launcher);

        // Викривлений крейдяний слід кулі НА обертовій платформі (в неінерціальній СВ)
        this.rotTrailGeo = new THREE.BufferGeometry();
        this.rotTrailLine = new THREE.Line(
          this.rotTrailGeo,
          new THREE.LineBasicMaterial({ color: 0xfacc15, linewidth: 2 })
        );
        this.turntableGroup.add(this.rotTrailLine);

        // Прямолінійний слід кулі в ІНЕРЦІАЛЬНІЙ системі відліку (над платформою)
        this.inertTrailGeo = new THREE.BufferGeometry();
        this.inertTrailLine = new THREE.Line(
          this.inertTrailGeo,
          new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 })
        );
        worldGroup.add(this.inertTrailLine);

        // Сталева куля
        this.ballMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 28, 28),
          new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.65, roughness: 0.22 })
        );
        this.ballMesh.castShadow = true;
        worldGroup.add(this.ballMesh);

        this.arrowVel = new SmartVectorArrow('v_відн (відносна)', 0x16a34a, '#16a34a');
        this.arrowCoriolis = new SmartVectorArrow('F_Кор = -2m[ω × v]', 0xd97706, '#d97706');
        this.arrowOmega = new SmartVectorArrow('ω (кутова платформи)', 0x2563eb, '#2563eb');
      }

      syncVisuals() {
        const p = sceneParams.coriolis;
        if (this.ballDist <= p.launchRadius + 0.01) {
          this.buildPreviewTrails();
        }
        this.rotTrailLine.visible = uiState.showTrails;
        this.inertTrailLine.visible = uiState.showTrails;
        this.updateUI();
      }

      buildPreviewTrails() {
        const p = sceneParams.coriolis;
        const r0 = p.launchRadius;
        const rMax = 3.85;
        const v = Math.max(0.1, p.ballSpeed);
        const inert = [];
        const rot = [];
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
          const r = r0 + (rMax - r0) * (i / steps);
          const t = (r - r0) / v;
          const phi = p.omegaDisk * t;
          inert.push(new THREE.Vector3(r, 0.84, 0));
          rot.push(new THREE.Vector3(r * Math.cos(phi), 0.14, r * Math.sin(phi)));
        }
        this.rotTrailGeo.setFromPoints(rot);
        this.inertTrailGeo.setFromPoints(inert);
      }

      reset() {
        const p = sceneParams.coriolis;
        this.diskAngle = 0;
        this.ballDist = p.launchRadius;
        this.phaseTriggered = false;
        this.inertialPts = [new THREE.Vector3(this.ballDist, 0.84, 0)];
        this.rotatingLocalPts = [new THREE.Vector3(this.ballDist, 0.14, 0)];
        this.turntableGroup.rotation.y = 0;
        this.ballMesh.position.set(this.ballDist, 0.84, 0);
        this.buildPreviewTrails();
        this.updateUI();
      }

      update(dt) {
        const p = sceneParams.coriolis;
        this.diskAngle += p.omegaDisk * dt;
        this.turntableGroup.rotation.y = this.diskAngle;

        if (this.ballDist < 3.85) {
          this.ballDist += p.ballSpeed * dt;
          if (this.ballDist >= 3.85) {
            this.ballDist = 3.85;
            if (!this.phaseTriggered && uiState.phase === 'test') {
              this.phaseTriggered = true;
              transitionToPhase('explain');
            }
          }
          // В інерціальній СВ куля рухається вздовж осі +X: r(t) = (ballDist, 0, 0)
          this.ballMesh.position.set(this.ballDist, 0.84, 0);
          this.inertialPts.push(new THREE.Vector3(this.ballDist, 0.84, 0));

          // У системі відліку диска (повернутій на кут diskAngle) локальні координати сліду:
          const locX = this.ballDist * Math.cos(this.diskAngle);
          const locZ = this.ballDist * Math.sin(this.diskAngle);
          this.rotatingLocalPts.push(new THREE.Vector3(locX, 0.14, locZ));

          this.rotTrailGeo.setFromPoints(this.rotatingLocalPts);
          this.inertTrailGeo.setFromPoints(this.inertialPts);
        }

        this.rotTrailLine.visible = uiState.showTrails;
        this.inertTrailLine.visible = uiState.showTrails;
        this.updateUI();
      }

      updateUI() {
        const p = sceneParams.coriolis;
        const pos = this.ballMesh.position.clone();
        const aCor = 2 * Math.abs(p.omegaDisk) * p.ballSpeed;
        const fCor = p.ballMass * aCor;
        const fCent = p.ballMass * p.omegaDisk * p.omegaDisk * this.ballDist;
        const rEff = this.ballDist > p.launchRadius + 0.01 ? this.ballDist : 3.85;
        const flightT = Math.max(0, rEff - p.launchRadius) / Math.max(0.1, p.ballSpeed);
        const deflection = Math.abs(p.omegaDisk) * rEff * flightT;

        this.arrowVel.update(
          pos,
          new THREE.Vector3(1, 0, 0),
          Math.min(2.2, p.ballSpeed * 0.55),
          uiState.showVectors,
          uiState.showLabels
        );

        const corDirZ = p.omegaDisk >= 0 ? 1 : -1;
        this.arrowCoriolis.update(
          pos,
          new THREE.Vector3(0, 0, corDirZ),
          Math.min(2.3, fCor * 0.22),
          uiState.showVectors && Math.abs(p.omegaDisk) > 0.05,
          uiState.showLabels
        );

        this.arrowOmega.update(
          new THREE.Vector3(0, 0.85, 0),
          new THREE.Vector3(0, p.omegaDisk >= 0 ? 1 : -1, 0),
          Math.min(2.2, Math.abs(p.omegaDisk) * 0.85),
          uiState.showVectors && Math.abs(p.omegaDisk) > 0.05,
          uiState.showLabels
        );

        const ekBall = 0.5 * p.ballMass * p.ballSpeed * p.ballSpeed;
        const ekDisk = 4.0 * p.omegaDisk * p.omegaDisk;
        const eTot = Math.max(1, ekBall + ekDisk);

        updateEnergyUI(ekBall, ekDisk, 0, eTot, [
          { label: 'Прискорення Коріоліса a_Кор', val: `${aCor.toFixed(2)} м/с²` },
          { label: 'Сила Коріоліса F_Кор', val: `${fCor.toFixed(2)} Н` },
          { label: 'Відцентрова сила F_вдц', val: `${fCent.toFixed(2)} Н` },
          { label: 'Бічне зміщення дуги Δs', val: `${deflection.toFixed(2)} м` }
        ]);
      }

      dispose() {
        this.arrowVel.dispose();
        this.arrowCoriolis.dispose();
        this.arrowOmega.dispose();
      }
    }

    // ============================================================================
    // 11s. МОДУЛЬ § 29: ЗАКОН ГУКА ТА МОДУЛЬ ЮНГА ПРИ РОЗТЯГУ СТРИЖНЯ
    // ============================================================================
    class HookeYoungModulusSimulation {
      constructor() {
        this.loadProg = 0;
        this.phaseTriggered = false;
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Станина лабораторної розривної машини для вимірювання модуля Юнга
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(4.6, 0.36, 2.8),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.45 })
        );
        base.position.set(0, 0.18, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Дві хромовані напрямні колони преса
        [-1.65, 1.65].forEach(x => {
          const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, 6.2, 24),
            new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.82, roughness: 0.22 })
          );
          col.position.set(x, 3.3, 0);
          col.castShadow = true;
          worldGroup.add(col);
        });

        // Верхня нерухома траверса з цанговим затискачем
        const topBeam = new THREE.Mesh(
          new THREE.BoxGeometry(3.9, 0.42, 0.9),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.55, roughness: 0.38 })
        );
        topBeam.position.set(0, 6.2, 0);
        worldGroup.add(topBeam);

        const topClamp = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.24, 0.45, 24),
          new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.3 })
        );
        topClamp.position.set(0, 5.8, 0);
        worldGroup.add(topClamp);

        // Досліджуваний металевий зразок (стрижень) з кристалічними поясками
        this.specimenMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 1.0, 28),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.76, roughness: 0.24 })
        );
        this.specimenMesh.castShadow = true;
        worldGroup.add(this.specimenMesh);

        // Нижня рухома навантажувальна траверса
        this.crossheadGroup = new THREE.Group();
        const botBeam = new THREE.Mesh(
          new THREE.BoxGeometry(3.7, 0.36, 0.82),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.6, roughness: 0.35 })
        );
        const botClamp = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.32, 0.42, 24),
          new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.3 })
        );
        botClamp.position.y = 0.36;
        const weightHanger = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.55, 0.5, 28),
          new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.5, roughness: 0.38 })
        );
        weightHanger.position.y = -0.55;
        this.crossheadGroup.add(botBeam, botClamp, weightHanger);
        worldGroup.add(this.crossheadGroup);

        // Циферблатний індикатор мікрометра (тензометр) праворуч із кронштейном
        this.gaugeGroup = new THREE.Group();
        this.gaugeGroup.position.set(1.05, 4.2, 0.45);
        const gaugeArm = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.08, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.75, roughness: 0.28 })
        );
        gaugeArm.position.set(-0.55, 0, -0.22);
        const dialBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.52, 0.52, 0.14, 32),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
        );
        dialBody.rotation.x = Math.PI / 2;
        const dialRim = new THREE.Mesh(
          new THREE.TorusGeometry(0.52, 0.045, 14, 32),
          new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.8, roughness: 0.22 })
        );
        this.dialNeedle = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.42, 0.03),
          new THREE.MeshBasicMaterial({ color: 0xdc2626 })
        );
        this.dialNeedle.position.set(0, 0, 0.09);
        this.gaugeGroup.add(gaugeArm, dialBody, dialRim, this.dialNeedle);
        worldGroup.add(this.gaugeGroup);

        this.arrowLoad = new SmartVectorArrow('F (навантаження)', 0xdc2626, '#dc2626');
        this.arrowElastic = new SmartVectorArrow('F_пруж = E·A·ε', 0x0284c7, '#0284c7');
      }

      syncVisuals() {
        this.syncSpecimen();
        this.updateUI();
      }

      reset() {
        this.baseProg = 0;
        this.loadProg = 0;
        this.phaseTriggered = false;
        this.syncSpecimen();
        this.updateUI();
      }

      getMetrics() {
        const p = sceneParams.hooke;
        const areaMm2 = Math.PI * 0.25 * p.rodDiam * p.rodDiam;
        const sigmaMPa = (p.loadForce * 1000) / areaMm2;
        const strain = sigmaMPa / (p.youngE * 1000); // безрозмірне ε (поділено на ГПа)
        const dlMm = p.rodLength * 1000 * strain;
        const workJ = 0.5 * (p.loadForce * 1000) * (dlMm * 0.001);
        return { areaMm2, sigmaMPa, strain, dlMm, workJ };
      }

      syncSpecimen() {
        const p = sceneParams.hooke;
        const { sigmaMPa, dlMm } = this.getMetrics();
        const prog = 0.25 + 0.75 * this.loadProg;
        const baseLenVis = 1.6 + p.rodLength * 0.45;
        const stretchVis = Math.min(0.95, dlMm * 0.085) * prog;
        const totalLen = baseLenVis + stretchVis;

        // Коефіцієнт Пуассона: поперечне звуження при поздовжньому розтягу
        const radVis = (p.rodDiam / 6.0) * 0.18 * (1 - 0.12 * stretchVis);
        const topY = 5.6;
        this.specimenMesh.scale.set(radVis / 0.18, totalLen, radVis / 0.18);
        this.specimenMesh.position.set(0, topY - totalLen * 0.5, 0);

        // Колір стрижня змінюється від мідно-золотого до розжарено-червоного при високій напрузі σ
        const stressFactor = Math.min(1, (sigmaMPa * prog) / 600);
        this.specimenMesh.material.color.setRGB(
          0.82 + 0.16 * stressFactor,
          0.52 - 0.32 * stressFactor,
          0.14
        );

        const botY = topY - totalLen - 0.36;
        this.crossheadGroup.position.set(0, botY, 0);
        this.dialNeedle.rotation.z = -prog * (dlMm * 0.35);
      }

      update(dt) {
        this.baseProg = Math.min(1, (this.baseProg || 0) + dt * 0.42);
        const osc = Math.sin(uiState.simTime * 5.0) * Math.exp(-uiState.simTime * 0.8) * 0.05;
        this.loadProg = Math.max(0, Math.min(1.06, this.baseProg + osc));

        if (uiState.simTime > 2.4 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }

        this.syncSpecimen();
        this.updateUI();
      }

      updateUI() {
        const p = sceneParams.hooke;
        const { sigmaMPa, strain, dlMm, workJ } = this.getMetrics();
        const botY = this.crossheadGroup.position.y;

        this.arrowLoad.update(
          new THREE.Vector3(0, botY - 0.75, 0),
          new THREE.Vector3(0, -1, 0),
          Math.min(2.3, p.loadForce * 0.13),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowElastic.update(
          new THREE.Vector3(0, botY + 0.65, 0.25),
          new THREE.Vector3(0, 1, 0),
          Math.min(2.3, p.loadForce * 0.13),
          uiState.showVectors,
          uiState.showLabels
        );

        updateEnergyUI(0, workJ, 0, Math.max(1, workJ), [
          { label: 'Механічна напруга σ = F/S', val: `${sigmaMPa.toFixed(1)} МПа` },
          { label: 'Відносне видовження ε', val: `${(strain * 100).toFixed(3)} %` },
          { label: 'Абсолютне видовження Δl', val: `${dlMm.toFixed(2)} мм` },
          { label: 'Пружна енергія W_пр', val: `${workJ.toFixed(1)} Дж` }
        ]);
      }

      dispose() {
        this.arrowLoad.dispose();
        this.arrowElastic.dispose();
      }
    }

    // ============================================================================
    // 11t. МОДУЛЬ § 30: ФОРМУЛА ТОРРІЧЕЛЛІ — ВИТІКАННЯ РІДИНИ З ОТВОРІВ
    // ============================================================================
    class TorricelliEffluxSimulation {
      constructor() {
        this.phaseTriggered = false;
        this.droplets = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const towerX = -2.2;

        // Опорний п'єдестал під напірну башту
        const towerPedestal = new THREE.Mesh(
          new THREE.CylinderGeometry(1.02, 1.06, 0.35, 36),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.45, roughness: 0.5 })
        );
        towerPedestal.position.set(towerX, 0.175, 0);
        towerPedestal.receiveShadow = true;
        worldGroup.add(towerPedestal);

        // Гідродинамічний лоток-басейн для приймання струменів води (без перетину з основою башти)
        const basin = new THREE.Mesh(
          new THREE.BoxGeometry(8.2, 0.30, 2.8),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.55 })
        );
        basin.position.set(2.0, 0.15, 0);
        basin.receiveShadow = true;
        worldGroup.add(basin);

        // Дзеркало води у приймальному лотку (чітко над дном лотка y = 0.30, без Z-fighting)
        const poolWater = new THREE.Mesh(
          new THREE.BoxGeometry(7.9, 0.04, 2.4),
          new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            emissive: 0x0369a1,
            emissiveIntensity: 0.16,
            transparent: true,
            opacity: 0.65,
            roughness: 0.14,
            side: THREE.FrontSide,
            depthWrite: false
          })
        );
        poolWater.position.set(2.0, 0.33, 0);
        poolWater.renderOrder = 2;
        worldGroup.add(poolWater);

        this.splashRings = [];
        const splashColors = [0x38bdf8, 0xfacc15, 0x0284c7];
        for (let i = 0; i < 3; i++) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.12, 0.22, 24),
            new THREE.MeshBasicMaterial({
              color: splashColors[i],
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.75,
              depthWrite: false
            })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.renderOrder = 3;
          worldGroup.add(ring);
          this.splashRings.push(ring);
        }

        // Лінійка дальності польоту струменя вздовж борту лотка
        for (let m = 0; m <= 10; m++) {
          const tick = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.04, m % 2 === 0 ? 0.5 : 0.26),
            new THREE.MeshBasicMaterial({ color: m % 2 === 0 ? 0xfef08a : 0x94a3b8 })
          );
          tick.position.set(-1.1 + m * 0.5, 0.36, 1.08);
          worldGroup.add(tick);
        }

        // Прозора циліндрична напірна башта Маріотта–Торрічеллі
        const glassTank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.92, 0.92, 5.2, 36, 1, true),
          new THREE.MeshPhysicalMaterial({
            color: 0xe0f2fe,
            transparent: true,
            opacity: 0.28,
            roughness: 0.08,
            side: THREE.FrontSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
          })
        );
        glassTank.position.set(towerX, 2.95, 0);
        glassTank.renderOrder = 4;
        worldGroup.add(glassTank);

        // Стовп рідини всередині башти
        this.waterColumn = new THREE.Mesh(
          new THREE.CylinderGeometry(0.88, 0.88, 1.0, 32),
          new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            emissive: 0x0369a1,
            emissiveIntensity: 0.16,
            transparent: true,
            opacity: 0.72,
            roughness: 0.18,
            side: THREE.FrontSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: 2,
            polygonOffsetUnits: 2
          })
        );
        this.waterColumn.renderOrder = 2;
        worldGroup.add(this.waterColumn);

        // Верхнє дзеркало води в башті
        this.towerSurface = new THREE.Mesh(
          new THREE.CircleGeometry(0.875, 32),
          new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        this.towerSurface.rotation.x = -Math.PI / 2;
        this.towerSurface.renderOrder = 3;
        worldGroup.add(this.towerSurface);

        // Латунні сопла (верхнє, досліджуване рухоме та нижнє)
        this.nozzleMeshes = [];
        for (let i = 0; i < 3; i++) {
          const noz = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.09, 0.28, 16),
            new THREE.MeshStandardMaterial({
              color: i === 1 ? 0xf59e0b : 0x64748b,
              metalness: 0.75,
              roughness: 0.25
            })
          );
          noz.rotation.z = -Math.PI / 2;
          worldGroup.add(noz);
          this.nozzleMeshes.push(noz);
        }

        // Три параболічні лінії струменів
        this.jetLines = [];
        const jetColors = [0x38bdf8, 0xfacc15, 0x0284c7];
        for (let i = 0; i < 3; i++) {
          const geo = new THREE.BufferGeometry();
          const line = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({ color: jetColors[i], linewidth: 2 })
          );
          worldGroup.add(line);
          this.jetLines.push({ geo, line });
        }

        // Частинки-краплі вздовж трьох параболічних струменів
        const dropGeo = new THREE.SphereGeometry(0.065, 10, 10);
        for (let j = 0; j < 3; j++) {
          const mat = new THREE.MeshStandardMaterial({
            color: j === 1 ? 0x38bdf8 : 0x7dd3fc,
            emissive: j === 1 ? 0x0284c7 : 0x0369a1,
            emissiveIntensity: 0.35,
            roughness: 0.15
          });
          for (let k = 0; k < 14; k++) {
            const mesh = new THREE.Mesh(dropGeo, mat);
            worldGroup.add(mesh);
            this.droplets.push({ mesh, jetIdx: j, phase: k / 14 });
          }
        }

        this.arrowV1 = new SmartVectorArrow('v₁ (верхній отвір)', 0x38bdf8, '#0284c7');
        this.arrowV2 = new SmartVectorArrow('v₂ (середній отвір)', 0xd97706, '#d97706');
        this.arrowV3 = new SmartVectorArrow('v₃ (нижній отвір)', 0x0284c7, '#0284c7');
      }

      syncVisuals() {
        this.updateJets(uiState.simTime);
        this.updateUI();
      }

      reset() {
        this.phaseTriggered = false;
        this.updateJets(0);
        this.updateUI();
      }

      getNozzleHeights() {
        const p = sceneParams.torricelli;
        const H = p.waterLevelH;
        const hMid = Math.min(H - 0.2, Math.max(0.25, p.nozzleDepthH));
        const hTop = Math.min(H - 0.15, Math.max(0.2, H * 0.22));
        const hBot = Math.min(H - 0.15, Math.max(0.3, H * 0.82));
        return [hTop, hMid, hBot];
      }

      updateJets(t) {
        const p = sceneParams.torricelli;
        const g = 9.81;
        const H = p.waterLevelH;
        const baseY = 0.35;
        const nozX = -1.25;

        this.waterColumn.scale.set(1, H - 0.02, 1);
        this.waterColumn.position.set(-2.2, baseY + 0.01 + (H - 0.02) * 0.5, 0);
        if (this.towerSurface) {
          this.towerSurface.position.set(-2.2, baseY + H, 0);
        }

        const depths = this.getNozzleHeights();
        depths.forEach((h, idx) => {
          const yNoz = baseY + (H - h);
          this.nozzleMeshes[idx].position.set(nozX - 0.08, yNoz, (idx - 1) * 0.18);

          const vEff = p.dischargeMu * Math.sqrt(Math.max(0, 2 * g * h));
          const fallH = Math.max(0.05, H - h);
          const tFall = Math.sqrt((2 * fallH) / g);

          const pts = [];
          for (let s = 0; s <= 28; s++) {
            const tau = (s / 28) * tFall;
            const x = nozX + vEff * tau;
            const y = yNoz - 0.5 * g * tau * tau;
            pts.push(new THREE.Vector3(x, y, (idx - 1) * 0.18));
          }
          this.jetLines[idx].geo.setFromPoints(pts);
          this.jetLines[idx].line.visible = uiState.showTrails;

          const xLand = nozX + vEff * tFall;
          const pulse = 0.85 + 0.3 * Math.sin(t * 6.0 + idx * 2.1);
          this.splashRings[idx].position.set(xLand, baseY + 0.035, (idx - 1) * 0.18);
          this.splashRings[idx].scale.set(pulse, pulse, 1);
          this.splashRings[idx].visible = vEff > 0.05;
        });

        this.droplets.forEach(d => {
          d.mesh.visible = uiState.showParticles;
          const h = depths[d.jetIdx];
          const yNoz = baseY + (H - h);
          const vEff = p.dischargeMu * Math.sqrt(Math.max(0, 2 * g * h));
          const fallH = Math.max(0.05, H - h);
          const tFall = Math.sqrt((2 * fallH) / g);
          const u = (d.phase + t * 1.45) % 1.0;
          const tau = u * tFall;
          d.mesh.position.set(
            nozX + vEff * tau,
            yNoz - 0.5 * g * tau * tau,
            (d.jetIdx - 1) * 0.18
          );
        });
      }

      update(dt) {
        this.updateJets(uiState.simTime);
        if (uiState.simTime > 2.4 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateUI();
      }

      updateUI() {
        const p = sceneParams.torricelli;
        const g = 9.81;
        const H = p.waterLevelH;
        const baseY = 0.35;
        const nozX = -1.25;
        const depths = this.getNozzleHeights();

        const arrows = [this.arrowV1, this.arrowV2, this.arrowV3];
        depths.forEach((h, idx) => {
          const yNoz = baseY + (H - h);
          const v = p.dischargeMu * Math.sqrt(Math.max(0, 2 * g * h));
          arrows[idx].update(
            new THREE.Vector3(nozX, yNoz, (idx - 1) * 0.18),
            new THREE.Vector3(1, 0, 0),
            Math.min(2.3, v * 0.22),
            uiState.showVectors,
            uiState.showLabels
          );
        });

        const hMid = depths[1];
        const vMid = p.dischargeMu * Math.sqrt(Math.max(0, 2 * g * hMid));
        const xRange = 2 * p.dischargeMu * Math.sqrt(Math.max(0, hMid * (H - hMid)));
        const pHydroKPa = p.liquidRho * g * hMid;

        const ekDensity = 0.5 * p.liquidRho * vMid * vMid;
        const epDensity = p.liquidRho * g * (H - hMid);
        const eTot = Math.max(1, p.liquidRho * g * H);

        updateEnergyUI(ekDensity, epDensity, Math.max(0, eTot - ekDensity - epDensity), eTot, [
          { label: 'Швидкість Торрічеллі v', val: `${vMid.toFixed(2)} м/с` },
          { label: 'Дальність струменя x(h)', val: `${xRange.toFixed(2)} м` },
          { label: 'Макс. дальність x_max = H', val: `${(H * p.dischargeMu).toFixed(2)} м` },
          { label: 'Гідростатичний тиск ρgh', val: `${pHydroKPa.toFixed(1)} кПа` }
        ]);
      }

      dispose() {
        this.arrowV1.dispose();
        this.arrowV2.dispose();
        this.arrowV3.dispose();
      }
    }

    // ============================================================================
    // 11u. МОДУЛЬ § 31: РОЗПОДІЛ МАКСВЕЛЛА ЗА ШВИДКОСТЯМИ МОЛЕКУЛ ГАЗУ
    // ============================================================================
    class MaxwellBoltzmannSimulation {
      constructor() {
        this.phaseTriggered = false;
        this.molecules = [];
        this.histBars = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Ліва частина: прозора теплова камера з молекулами газу
        const chamberBase = new THREE.Mesh(
          new THREE.BoxGeometry(4.0, 0.3, 3.6),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.45, roughness: 0.5 })
        );
        chamberBase.position.set(-2.9, 0.15, 0);
        worldGroup.add(chamberBase);

        const chamberGlass = new THREE.Mesh(
          new THREE.BoxGeometry(3.7, 3.8, 3.3),
          new THREE.MeshPhysicalMaterial({
            color: 0xe0f2fe,
            transparent: true,
            opacity: 0.22,
            roughness: 0.1,
            depthWrite: false
          })
        );
        chamberGlass.position.set(-2.9, 2.2, 0);
        worldGroup.add(chamberGlass);

        // Права частина: 3D-спектрометр розподілу Максвелла f(v) з 18 стовпчиками гістограми
        const histStand = new THREE.Mesh(
          new THREE.BoxGeometry(6.0, 0.3, 2.6),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.45, roughness: 0.5 })
        );
        histStand.position.set(2.4, 0.15, 0);
        worldGroup.add(histStand);

        const numBins = 18;
        for (let b = 0; b < numBins; b++) {
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(0.26, 1.0, 0.55),
            new THREE.MeshStandardMaterial({
              color: 0x0284c7,
              metalness: 0.35,
              roughness: 0.32
            })
          );
          bar.castShadow = true;
          worldGroup.add(bar);
          this.histBars.push(bar);
        }

        // Неперервна теоретична крива Максвелла поверх 3D-гістограми
        this.curveGeo = new THREE.BufferGeometry();
        this.curveLine = new THREE.Line(
          this.curveGeo,
          new THREE.LineBasicMaterial({ color: 0xfef08a, linewidth: 2 })
        );
        worldGroup.add(this.curveLine);

        // Молекули в тепловій камері (кольорове кодування за швидкістю: сині -> зелені -> гарячі червоні)
        const molGeo = new THREE.SphereGeometry(0.095, 12, 12);
        for (let i = 0; i < 140; i++) {
          const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.25, metalness: 0.3 });
          const mesh = new THREE.Mesh(molGeo, mat);
          mesh.position.set(
            -2.9 + (Math.random() - 0.5) * 3.1,
            0.5 + Math.random() * 3.3,
            (Math.random() - 0.5) * 2.8
          );
          const speedRatio = 0.25 + Math.random() * 1.9;
          const theta = Math.random() * Math.PI * 2;
          const phi = (Math.random() - 0.5) * Math.PI;
          const dir = new THREE.Vector3(
            Math.cos(phi) * Math.cos(theta),
            Math.sin(phi),
            Math.cos(phi) * Math.sin(theta)
          ).normalize();
          worldGroup.add(mesh);
          this.molecules.push({ mesh, dir, speedRatio });
        }

        this.arrowVp = new SmartVectorArrow('v_p (найімовірніша)', 0x16a34a, '#16a34a');
        this.arrowVrms = new SmartVectorArrow('v_кв (сер.-квадр.)', 0xdc2626, '#dc2626');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      syncVisuals() {
        this.updateDistribution();
        this.updateUI();
      }

      getSpeeds() {
        const p = sceneParams.maxwell;
        const R = 8.314;
        const mKg = p.molarMassM * 0.001;
        const vp = Math.sqrt((2 * R * p.gasTempT) / mKg);
        const vAvg = Math.sqrt((8 * R * p.gasTempT) / (Math.PI * mKg));
        const vRms = Math.sqrt((3 * R * p.gasTempT) / mKg);
        return { vp, vAvg, vRms };
      }

      updateDistribution() {
        const p = sceneParams.maxwell;
        const { vp, vRms } = this.getSpeeds();
        const vMaxPlot = 2200;
        const numBins = this.histBars.length;
        const startX = -0.3;
        const widthX = 5.4;

        const curvePts = [];
        for (let b = 0; b < numBins; b++) {
          const v = ((b + 0.5) / numBins) * vMaxPlot;
          const u = v / vp;
          // Нормована густина Максвелла f(v) ~ (u² / vp) * exp(-u²)
          const probDensity = (4 / Math.sqrt(Math.PI)) * (u * u / (vp / 500)) * Math.exp(-u * u);
          const barH = Math.max(0.08, Math.min(4.4, probDensity * 2.5));
          const x = startX + (b / (numBins - 1)) * widthX;

          const bar = this.histBars[b];
          bar.scale.set(1, barH, 1);
          bar.position.set(x, 0.3 + barH * 0.5, 0);

          const isAboveThreshold = v >= vp * p.thresholdRatio;
          const heatRatio = Math.min(1, v / (vp * 1.6));
          if (isAboveThreshold) {
            bar.material.color.setHex(0xef4444);
          } else {
            bar.material.color.setRGB(0.1 + 0.5 * heatRatio, 0.48 + 0.3 * (1 - heatRatio), 0.9 - 0.4 * heatRatio);
          }
          curvePts.push(new THREE.Vector3(x, 0.3 + barH + 0.06, 0.32));
        }

        this.curveGeo.setFromPoints(curvePts);
        this.curveLine.visible = uiState.showTrails;

        this.molecules.forEach((m, idx) => {
          m.mesh.visible = uiState.showParticles && idx < p.particleCount;
          const c = Math.min(1, m.speedRatio / 1.8);
          m.mesh.material.color.setRGB(0.15 + 0.82 * c, 0.65 - 0.35 * c, 0.95 - 0.75 * c);
        });

        const xVp = startX + Math.min(1, vp / vMaxPlot) * widthX;
        const xVrms = startX + Math.min(1, vRms / vMaxPlot) * widthX;

        this.arrowVp.update(
          new THREE.Vector3(xVp, 0.35, 0.45),
          new THREE.Vector3(0, 1, 0),
          2.1,
          uiState.showVectors,
          uiState.showLabels
        );
        this.arrowVrms.update(
          new THREE.Vector3(xVrms, 0.35, 0.45),
          new THREE.Vector3(0, 1, 0),
          1.75,
          uiState.showVectors,
          uiState.showLabels
        );
      }

      update(dt) {
        const { vp } = this.getSpeeds();
        const speedScale = (vp / 480) * 2.2;

        this.molecules.forEach(m => {
          if (!m.mesh.visible) return;
          m.mesh.position.addScaledVector(m.dir, m.speedRatio * speedScale * dt);
          if (m.mesh.position.x < -4.55 || m.mesh.position.x > -1.25) m.dir.x *= -1;
          if (m.mesh.position.y < 0.45 || m.mesh.position.y > 3.9) m.dir.y *= -1;
          if (m.mesh.position.z < -1.45 || m.mesh.position.z > 1.45) m.dir.z *= -1;
        });

        this.updateDistribution();

        if (uiState.simTime > 2.4 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateUI();
      }

      updateUI() {
        const p = sceneParams.maxwell;
        const { vp, vAvg, vRms } = this.getSpeeds();
        const u = p.thresholdRatio;
        // Точний інтеграл хвоста розподілу Максвелла: P(v >= u*vp) = (2/√π)*u*exp(-u²) + erfc(u)
        const tErfc = 1 / (1 + 0.3275911 * u);
        const poly = tErfc * (0.254829592 + tErfc * (-0.284496736 + tErfc * (1.421413741 + tErfc * (-1.453152027 + tErfc * 1.061405429))));
        const erfcU = poly * Math.exp(-u * u);
        const fastFraction = Math.min(100, Math.max(0, ((2 / Math.sqrt(Math.PI)) * u * Math.exp(-u * u) + erfcU) * 100));
        const ekMeanEv = (1.5 * 8.314 * p.gasTempT) / 1000;

        updateEnergyUI(ekMeanEv, fastFraction * 0.1, 0, Math.max(1, ekMeanEv + fastFraction * 0.1), [
          { label: 'Найімовірніша v_p', val: `${vp.toFixed(0)} м/с` },
          { label: 'Середня арифм. ⟨v⟩', val: `${vAvg.toFixed(0)} м/с` },
          { label: 'Сер.-квадратична v_кв', val: `${vRms.toFixed(0)} м/с` },
          { label: 'Частка швидких молекул', val: `${fastFraction.toFixed(1)} %` }
        ]);
      }

      dispose() {
        this.arrowVp.dispose();
        this.arrowVrms.dispose();
      }
    }

    // ============================================================================
    // 11v. МОДУЛЬ § 32: КІЛЬЦЯ НЬЮТОНА — ІНТЕРФЕРЕНЦІЯ В ТОНКИХ ПЛІВКАХ
    // ============================================================================
    class NewtonRingsSimulation {
      constructor() {
        this.phaseTriggered = false;
        this.brightRings = [];
        this.waveDiscs = [];
        this.buildScene();
        this.reset();
      }

      lambdaToColor(nm) {
        const t = Math.max(0, Math.min(1, (nm - 400) / 280));
        const col = new THREE.Color();
        col.setHSL((1 - t) * 0.74, 0.92, 0.52);
        return col;
      }

      buildScene() {
        // Оптичний столик інтерферометра з чорним матовим поглиначем під скляною пластиною
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(3.8, 4.0, 0.34, 48),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.45, roughness: 0.55 })
        );
        base.position.set(0, 0.17, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Плоскопаралельна оптична скляна пластина
        const flatGlass = new THREE.Mesh(
          new THREE.CylinderGeometry(3.4, 3.4, 0.24, 48),
          new THREE.MeshPhysicalMaterial({
            color: 0xe0f2fe,
            transparent: true,
            opacity: 0.42,
            roughness: 0.08,
            metalness: 0.05
          })
        );
        flatGlass.position.set(0, 0.46, 0);
        worldGroup.add(flatGlass);

        // Латунна оправа з мікрометричними гвинтами
        const brassMount = new THREE.Mesh(
          new THREE.TorusGeometry(3.42, 0.1, 16, 64),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.78, roughness: 0.24 })
        );
        brassMount.rotation.x = Math.PI / 2;
        brassMount.position.set(0, 0.56, 0);
        worldGroup.add(brassMount);

        // Високодеталізована динамічна текстура інтерференційної картини кілець Ньютона I(r) = sin²(π n₀ r² / (λ R))
        this.ringCanvas = document.createElement('canvas');
        this.ringCanvas.width = 512;
        this.ringCanvas.height = 512;
        this.ringTexture = new THREE.CanvasTexture(this.ringCanvas);
        const patternPlane = new THREE.Mesh(
          new THREE.CircleGeometry(3.25, 64),
          new THREE.MeshBasicMaterial({
            map: this.ringTexture,
            transparent: true,
            opacity: 0.92,
            depthWrite: false
          })
        );
        patternPlane.rotation.x = -Math.PI / 2;
        patternPlane.position.set(0, 0.59, 0);
        worldGroup.add(patternPlane);

        // Концентричні 3D-маркери світлих інтерференційних максимумів на межі повітряного клина
        for (let m = 1; m <= 9; m++) {
          const ringMesh = new THREE.Mesh(
            new THREE.RingGeometry(0.92, 1.0, 64),
            new THREE.MeshBasicMaterial({
              color: 0x22c55e,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: Math.max(0.28, 0.85 - m * 0.06)
            })
          );
          ringMesh.rotation.x = -Math.PI / 2;
          ringMesh.position.set(0, 0.593 + m * 0.0005, 0);
          worldGroup.add(ringMesh);
          this.brightRings.push(ringMesh);
        }

        // Плоско-опукла лінза великого радіуса кривизни R, що лежить опуклістю донизу
        this.lensMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(3.2, 2.2, 0.65, 48),
          new THREE.MeshPhysicalMaterial({
            color: 0xbae6fd,
            transparent: true,
            opacity: 0.28,
            roughness: 0.06,
            depthWrite: false
          })
        );
        this.lensMesh.position.set(0, 1.02, 0);
        worldGroup.add(this.lensMesh);

        // Напівпрозоре дзеркало-куб та монохроматичний освітлювач згори
        const splitter = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.04, 1.8),
          new THREE.MeshPhysicalMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: 0.36,
            roughness: 0.05
          })
        );
        splitter.position.set(0, 4.4, 0);
        splitter.rotation.z = Math.PI / 4;
        worldGroup.add(splitter);

        // Рухомі диски монохроматичних хвильових фронтів (падаючий та два інтерферуючі відбиті)
        for (let i = 0; i < 8; i++) {
          const disc = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 1.55, 36),
            new THREE.MeshBasicMaterial({
              color: 0x22c55e,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.35
            })
          );
          disc.rotation.x = -Math.PI / 2;
          worldGroup.add(disc);
          this.waveDiscs.push({ mesh: disc, idx: i });
        }

        // Маркер вимірюваного кільця порядку m
        this.cursorRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.0, 0.032, 12, 64),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        this.cursorRing.rotation.x = Math.PI / 2;
        this.cursorRing.position.set(0, 0.63, 0);
        worldGroup.add(this.cursorRing);

        this.arrowInc = new SmartVectorArrow('k_пад (монохромат.)', 0x16a34a, '#16a34a');
        this.arrowRefl = new SmartVectorArrow('k₁,₂ (інтерференція)', 0x0284c7, '#0284c7');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      syncVisuals() {
        this.syncRings();
        this.updateUI();
      }

      updateInterferenceTexture(col, scaleFactor) {
        const key = `${col.getHexString()}_${scaleFactor.toFixed(4)}`;
        if (this.lastTexKey === key) return;
        this.lastTexKey = key;

        const ctx = this.ringCanvas.getContext('2d');
        const w = this.ringCanvas.width;
        const cx = w * 0.5;
        const maxR = w * 0.5;
        ctx.clearRect(0, 0, w, w);

        const rCol = Math.round(col.r * 255);
        const gCol = Math.round(col.g * 255);
        const bCol = Math.round(col.b * 255);

        const imgData = ctx.createImageData(w, w);
        const data = imgData.data;
        const invScale2 = 1 / Math.max(0.05, scaleFactor * scaleFactor * 0.8464);

        for (let py = 0; py < w; py++) {
          const dy = py - cx;
          for (let px = 0; px < w; px++) {
            const dx = px - cx;
            const rPix = Math.sqrt(dx * dx + dy * dy);
            if (rPix > maxR) continue;
            const rVis = (rPix / maxR) * 3.25;
            // Інтенсивність I(r) = sin²(π * r² / r₁²) із темним центром при r = 0
            const phase = Math.PI * rVis * rVis * invScale2;
            const s = Math.sin(phase);
            const env = Math.max(0.15, 1 - 0.18 * (rPix / maxR));
            const inten = s * s * env;
            const idx = (py * w + px) * 4;
            data[idx] = Math.round(rCol * inten);
            data[idx + 1] = Math.round(gCol * inten);
            data[idx + 2] = Math.round(bCol * inten);
            data[idx + 3] = Math.round(235 * (0.35 + 0.65 * inten));
          }
        }
        ctx.putImageData(imgData, 0, 0);
        this.ringTexture.needsUpdate = true;
      }

      syncRings() {
        const p = sceneParams.newtonrings;
        const col = this.lambdaToColor(p.lambdaNm);
        const scaleFactor = Math.sqrt((p.lambdaNm / 550) * (p.lensRadiusR / 2.5) / p.gapIndexN);

        this.updateInterferenceTexture(col, scaleFactor);

        this.brightRings.forEach((ring, i) => {
          const m = i + 1;
          const rBrightVis = 0.92 * Math.sqrt(m - 0.5) * scaleFactor;
          ring.scale.set(rBrightVis, rBrightVis, 1);
          ring.material.color.copy(col);
          ring.visible = rBrightVis < 3.25;
        });

        const rDarkMVis = 0.92 * Math.sqrt(p.ringOrderM) * scaleFactor;
        this.cursorRing.scale.set(rDarkMVis, rDarkMVis, 1);
        this.cursorRing.visible = uiState.showTrails && rDarkMVis < 3.3;

        this.lensMesh.scale.set(1, Math.max(0.45, 1.35 - p.lensRadiusR * 0.16), 1);

        this.waveDiscs.forEach(w => {
          w.mesh.visible = uiState.showParticles;
          w.mesh.material.color.copy(col);
          const u = ((w.idx / this.waveDiscs.length) + uiState.simTime * 0.65) % 1.0;
          w.mesh.position.set(0, 0.8 + u * 4.2, 0);
        });
      }

      update(dt) {
        this.syncRings();
        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateUI();
      }

      updateUI() {
        const p = sceneParams.newtonrings;
        const m = p.ringOrderM;
        const rDarkMm = Math.sqrt((m * (p.lambdaNm * 1e-6) * (p.lensRadiusR * 1000)) / p.gapIndexN);
        const rBrightMm = Math.sqrt(((m - 0.5) * (p.lambdaNm * 1e-6) * (p.lensRadiusR * 1000)) / p.gapIndexN);
        const airGapUm = (m * p.lambdaNm * 0.001) / (2 * p.gapIndexN);

        this.arrowInc.update(
          new THREE.Vector3(-0.65, 4.9, 0),
          new THREE.Vector3(0, -1, 0),
          1.9,
          uiState.showVectors,
          uiState.showLabels
        );
        this.arrowRefl.update(
          new THREE.Vector3(0.65, 1.5, 0),
          new THREE.Vector3(0, 1, 0),
          1.9,
          uiState.showVectors,
          uiState.showLabels
        );

        updateEnergyUI(38, 62, 0, 100, [
          { label: `Радіус темного кільця r_${m}`, val: `${rDarkMm.toFixed(2)} мм` },
          { label: `Радіус світлого кільця r_${m}`, val: `${rBrightMm.toFixed(2)} мм` },
          { label: 'Товщина прошарку d(r_m)', val: `${airGapUm.toFixed(2)} мкм` },
          { label: 'Зсув фази при відбитті', val: 'Δφ = π (λ/2)' }
        ]);
      }

      dispose() {
        this.arrowInc.dispose();
        this.arrowRefl.dispose();
      }
    }

    // ============================================================================
    // 11w. МОДУЛЬ § 33: ЗОВНІШНІЙ ФОТОЕФЕКТ ТА РІВНЯННЯ ЕЙНШТЕЙНА
    // ============================================================================
    class PhotoelectricEffectSimulation {
      constructor() {
        this.phaseTriggered = false;
        this.photons = [];
        this.electrons = [];
        this.buildScene();
        this.reset();
      }

      lambdaToColor(nm) {
        if (nm < 380) return new THREE.Color(0xa855f7); // УФ-діапазон
        const t = Math.max(0, Math.min(1, (nm - 380) / 270));
        const col = new THREE.Color();
        col.setHSL((1 - t) * 0.74, 0.95, 0.55);
        return col;
      }

      buildScene() {
        // Лабораторний стенд установки Столєтова–Ейнштейна з мікроамперметром та вольтметром
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(8.2, 0.34, 3.6),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.45, roughness: 0.5 })
        );
        base.position.set(0, 0.17, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Кварцова вакуумна колба фотоелемента
        const tubeGlass = new THREE.Mesh(
          new THREE.CylinderGeometry(1.45, 1.45, 5.4, 36),
          new THREE.MeshPhysicalMaterial({
            color: 0xe0f2fe,
            transparent: true,
            opacity: 0.24,
            roughness: 0.06,
            depthWrite: false
          })
        );
        tubeGlass.rotation.z = Math.PI / 2;
        tubeGlass.position.set(0, 2.7, 0);
        worldGroup.add(tubeGlass);

        // Увігнутий фотокатод K ліворуч (мішень, вкрита лужним металом)
        this.cathodeMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1, 1.1, 0.18, 32),
          new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.78, roughness: 0.24 })
        );
        this.cathodeMesh.rotation.z = Math.PI / 2;
        this.cathodeMesh.position.set(-2.1, 2.7, 0);
        worldGroup.add(this.cathodeMesh);

        // Кільцевий анод-колектор A праворуч
        const anodeRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.85, 0.09, 16, 36),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.2 })
        );
        anodeRing.rotation.y = Math.PI / 2;
        anodeRing.position.set(2.0, 2.7, 0);
        worldGroup.add(anodeRing);

        // УФ/оптичний освітлювач зліва вгорі, спрямований на катод
        const lampHousing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.55, 1.3, 24),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.35 })
        );
        lampHousing.position.set(-3.7, 5.0, 0);
        lampHousing.rotation.z = -0.82;
        worldGroup.add(lampHousing);

        // Корпус мікроамперметра зі стрілкою фотоструму I_ф
        const meterBox = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 1.25, 0.5),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 })
        );
        meterBox.position.set(0, 0.95, 1.25);
        worldGroup.add(meterBox);

        this.ammeterNeedle = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.48, 0.04),
          new THREE.MeshBasicMaterial({ color: 0xdc2626 })
        );
        this.ammeterNeedle.position.set(0, 0.88, 1.52);
        worldGroup.add(this.ammeterNeedle);

        // Хвильові пакети фотонів hν, що летять від освітлювача до фотокатода
        const photonGeo = new THREE.SphereGeometry(0.085, 12, 12);
        for (let i = 0; i < 18; i++) {
          const mat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
          const mesh = new THREE.Mesh(photonGeo, mat);
          worldGroup.add(mesh);
          this.photons.push({
            mesh,
            phase: i / 18,
            offsetY: ((i % 5) - 2) * 0.26,
            offsetZ: ((Math.floor(i / 5) % 3) - 1) * 0.26
          });
        }

        // Вибиті фотоелектрони e⁻, що летять від катода K (-2.0) до анода A (+2.0) у гальмівному полі
        const elGeo = new THREE.SphereGeometry(0.075, 12, 12);
        const elMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.65
        });
        for (let j = 0; j < 24; j++) {
          const mesh = new THREE.Mesh(elGeo, elMat);
          worldGroup.add(mesh);
          this.electrons.push({
            mesh,
            phase: j / 24,
            y0: 2.7 + ((j % 5) - 2) * 0.28,
            z0: ((Math.floor(j / 5) % 5) - 2) * 0.24,
            eFrac: 0.55 + 0.45 * ((j % 4) / 3)
          });
        }

        this.arrowPhoton = new SmartVectorArrow('hν (потік фотонів)', 0x9333ea, '#9333ea');
        this.arrowElectron = new SmartVectorArrow('v_max (фотоелектрони)', 0x16a34a, '#16a34a');
        this.arrowRetard = new SmartVectorArrow('E_гальм (затримуюче)', 0xdc2626, '#dc2626');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      syncVisuals() {
        this.updateParticles(uiState.simTime);
        this.updateUI();
      }

      getPhotoMetrics() {
        const p = sceneParams.photoelectric;
        const ePhotonEv = 1240 / p.wavelengthNm;
        const ekMaxEv = Math.max(0, ePhotonEv - p.workFuncEv);
        const uStopV = ekMaxEv;
        const netEv = ekMaxEv - p.retardingVolt;
        const reachesAnode = ekMaxEv > 0 && netEv > 0;
        const photoCurrentUa = reachesAnode
          ? p.intensityFlux * 18.0 * Math.min(1, (netEv / Math.max(0.15, ekMaxEv)) * 0.85 + 0.15)
          : 0;
        return { ePhotonEv, ekMaxEv, uStopV, netEv, reachesAnode, photoCurrentUa };
      }

      updateParticles(t) {
        const p = sceneParams.photoelectric;
        const { ekMaxEv } = this.getPhotoMetrics();
        const col = this.lambdaToColor(p.wavelengthNm);

        const activePhotons = Math.round(6 + p.intensityFlux * 4);
        this.photons.forEach((ph, idx) => {
          ph.mesh.visible = uiState.showParticles && idx < activePhotons;
          ph.mesh.material.color.copy(col);
          const u = (ph.phase + t * 1.15) % 1.0;
          const x = -3.55 + u * 1.45;
          const y = 4.75 - u * 2.05 + ph.offsetY + 0.06 * Math.sin(u * 18);
          ph.mesh.position.set(x, y, ph.offsetZ);
        });

        const activeElectrons = ekMaxEv > 0 ? Math.round(8 + p.intensityFlux * 5) : 0;
        this.electrons.forEach((el, idx) => {
          if (!uiState.showParticles || idx >= activeElectrons || ekMaxEv <= 0) {
            el.mesh.visible = false;
            return;
          }
          el.mesh.visible = true;
          const eInit = ekMaxEv * el.eFrac;
          const u = (el.phase + t * 0.9) % 1.0;

          if (p.retardingVolt <= 0.02 || eInit > p.retardingVolt) {
            // Електрон долає затримуюче поле і досягає анода (+2.0)
            const x = -2.0 + u * 4.0;
            el.mesh.position.set(x, el.y0, el.z0);
          } else {
            // Затримуючий потенціал повертає електрон назад до катода на відстані x_turn
            const turnFrac = Math.max(0.12, eInit / p.retardingVolt);
            const maxDist = 3.8 * turnFrac;
            const para = 4 * u * (1 - u);
            const x = -2.0 + maxDist * para;
            el.mesh.position.set(x, el.y0 + 0.15 * u, el.z0);
          }
        });
      }

      update(dt) {
        this.updateParticles(uiState.simTime);
        if (uiState.simTime > 2.4 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateUI();
      }

      updateUI() {
        const p = sceneParams.photoelectric;
        const { ePhotonEv, ekMaxEv, uStopV, photoCurrentUa } = this.getPhotoMetrics();
        const lambdaMaxNm = 1240 / p.workFuncEv;

        this.ammeterNeedle.rotation.z = -Math.min(1.15, photoCurrentUa * 0.022);

        this.arrowPhoton.update(
          new THREE.Vector3(-3.3, 4.4, 0),
          new THREE.Vector3(0.6, -0.8, 0).normalize(),
          Math.min(2.1, ePhotonEv * 0.45),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowElectron.update(
          new THREE.Vector3(-1.6, 2.7, 0),
          new THREE.Vector3(1, 0, 0),
          Math.min(2.2, ekMaxEv * 0.85),
          uiState.showVectors && ekMaxEv > 0.02,
          uiState.showLabels
        );

        this.arrowRetard.update(
          new THREE.Vector3(1.5, 3.35, 0),
          new THREE.Vector3(-1, 0, 0),
          Math.min(2.1, p.retardingVolt * 0.8),
          uiState.showVectors && p.retardingVolt > 0.05,
          uiState.showLabels
        );

        const qWork = Math.min(ePhotonEv, p.workFuncEv);
        const eRet = Math.min(ekMaxEv, p.retardingVolt);

        updateEnergyUI(ekMaxEv, qWork, eRet, Math.max(1, ePhotonEv), [
          { label: 'Енергія фотона hν', val: `${ePhotonEv.toFixed(2)} еВ` },
          { label: 'Макс. кінетична E_k,max', val: `${ekMaxEv.toFixed(2)} еВ` },
          { label: 'Затримуюча напруга U_з', val: `${uStopV.toFixed(2)} В` },
          { label: 'Фотострум I_ф / λ_кр', val: `${photoCurrentUa.toFixed(1)} мкА (${lambdaMaxNm.toFixed(0)} нм)` }
        ]);
      }

      dispose() {
        this.arrowPhoton.dispose();
        this.arrowElectron.dispose();
        this.arrowRetard.dispose();
      }
    }

    // ============================================================================
    // 11x. МОДУЛЬ § 34: ДОСЛІД РЕЗЕРФОРДА — РОЗСІЯННЯ α-ЧАСТИНОК АТОМНИМ ЯДРОМ
    // ============================================================================
    class RutherfordScatteringSimulation {
      constructor() {
        this.phaseTriggered = false;
        this.hyperbolas = [];
        this.alphaParticles = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Кругла вакуумна камера розсіяння Гейгера–Марсдена–Резерфорда
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(4.5, 4.7, 0.32, 48),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.45, roughness: 0.52 })
        );
        base.position.set(0, 0.16, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Кільцевий флуоресцентний екран із сірчистого цинку (ZnS) навколо золотої фольги
        const znsScreen = new THREE.Mesh(
          new THREE.CylinderGeometry(4.2, 4.2, 1.5, 48, 1, true),
          new THREE.MeshStandardMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
            roughness: 0.3
          })
        );
        znsScreen.position.set(0, 2.2, 0);
        worldGroup.add(znsScreen);

        // Свинцевий коліматор джерела α-частинок ліворуч
        const leadBox = new THREE.Mesh(
          new THREE.BoxGeometry(1.3, 1.1, 1.1),
          new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.65, roughness: 0.38 })
        );
        leadBox.position.set(-4.1, 2.2, 0);
        worldGroup.add(leadBox);

        // Надтонка золота фольга та масивне додатне ядро +Ze в центрі
        const goldFoil = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 2.6, 3.2),
          new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            metalness: 0.85,
            roughness: 0.2,
            transparent: true,
            opacity: 0.28
          })
        );
        goldFoil.position.set(0, 2.2, 0);
        worldGroup.add(goldFoil);

        this.nucleusMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 32, 32),
          new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0xd97706,
            emissiveIntensity: 0.55,
            metalness: 0.7,
            roughness: 0.2
          })
        );
        this.nucleusMesh.position.set(0, 2.2, 0);
        worldGroup.add(this.nucleusMesh);

        // Концентричні сфери кулонівського потенціалу U(r) = 2Ze²/(4πε₀r) навколо ядра
        [0.75, 1.35].forEach((rad, i) => {
          const shell = new THREE.Mesh(
            new THREE.SphereGeometry(rad, 24, 24),
            new THREE.MeshBasicMaterial({
              color: 0xfef08a,
              wireframe: true,
              transparent: true,
              opacity: 0.16 - i * 0.05
            })
          );
          shell.position.set(0, 2.2, 0);
          worldGroup.add(shell);
        });

        // Віяло гіперболічних траєкторій розсіяння для різних прицільних параметрів b
        const bFactors = [-2.2, -1.2, -0.55, 0.25, 0.65, 1.35, 2.3];
        bFactors.forEach((bf, idx) => {
          const isPrimary = idx === 3;
          const geo = new THREE.BufferGeometry();
          const line = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({
              color: isPrimary ? 0xfacc15 : 0x38bdf8,
              linewidth: isPrimary ? 3 : 1.5
            })
          );
          worldGroup.add(line);

          const pMesh = new THREE.Mesh(
            new THREE.SphereGeometry(isPrimary ? 0.13 : 0.085, 14, 14),
            new THREE.MeshStandardMaterial({
              color: isPrimary ? 0xef4444 : 0x38bdf8,
              emissive: isPrimary ? 0xdc2626 : 0x0284c7,
              emissiveIntensity: 0.55
            })
          );
          worldGroup.add(pMesh);

          this.hyperbolas.push({ geo, line, pMesh, bf, isPrimary, pts: [] });
        });

        this.arrowVel = new SmartVectorArrow('v_α (імпульс частинки)', 0x16a34a, '#16a34a');
        this.arrowCoulomb = new SmartVectorArrow('F_К (відштовхування ядра)', 0xdc2626, '#dc2626');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      syncVisuals() {
        this.rebuildHyperbolas();
        this.updateParticles(uiState.simTime);
        this.updateUI();
      }

      computeHyperbolaPoints(bFm) {
        const p = sceneParams.rutherford;
        const rMinFm = (2 * p.nuclearZ * 1.44) / p.alphaEnergyMev;
        const absB = Math.max(2.0, Math.abs(bFm));
        const signB = bFm >= 0 ? 1 : -1;
        // Точний кут резерфордівського розсіяння θ = 2 arctan(r_min / (2b))
        const theta = 2 * Math.atan(rMinFm / (2 * absB));
        const bVis = signB * Math.min(2.4, (absB / 25) * p.beamSpread);
        const rMinVis = Math.max(0.36, rMinFm / 45);

        // Точна аналітична гіпербола Кеплера–Кулона у фокусі атомного ядра (0, 2.2, 0)
        const a = rMinVis * 0.5;
        const bAbsVis = Math.max(0.08, Math.abs(bVis));
        const ecc = Math.sqrt(1 + (bAbsVis * bAbsVis) / (a * a));
        const sinHalf = 1 / ecc;
        const cosHalf = bAbsVis / (a * ecc);

        const pts = [];
        const steps = 48;
        const hMax = 2.05;
        for (let i = 0; i <= steps; i++) {
          const H = ((i / steps) * 2 - 1) * hMax; // гіперболічна аномалія H ∈ [-hMax, +hMax]
          const uVert = a * (ecc + Math.cosh(H)); // відстань уздовж осі симетрії (перицентр при H = 0 має r_min = a(e+1))
          const uTrans = bAbsVis * Math.sinh(H);
          // Поворот від осі симетрії гіперболи до напрямку падаючого пучка (+X при H -> -∞)
          const x = -uVert * sinHalf + uTrans * cosHalf;
          const z = signB * (uVert * cosHalf + uTrans * sinHalf);
          pts.push(new THREE.Vector3(x, 2.2, z));
        }
        return { pts, theta, rMinFm };
      }

      rebuildHyperbolas() {
        const p = sceneParams.rutherford;
        const scaleNuc = 0.8 + (p.nuclearZ / 79) * 0.35;
        this.nucleusMesh.scale.set(scaleNuc, scaleNuc, scaleNuc);

        this.hyperbolas.forEach(h => {
          const bFm = h.isPrimary ? p.impactParamB : h.bf * 18 * p.beamSpread;
          const { pts } = this.computeHyperbolaPoints(bFm);
          h.pts = pts;
          h.geo.setFromPoints(pts);
          h.line.visible = uiState.showTrails;
        });
      }

      updateParticles(t) {
        this.rebuildHyperbolas();
        this.hyperbolas.forEach((h, idx) => {
          h.pMesh.visible = uiState.showParticles || h.isPrimary;
          const u = ((t * 0.52 + idx * 0.14) % 1.0) * (h.pts.length - 1);
          const i0 = Math.floor(u);
          const i1 = Math.min(h.pts.length - 1, i0 + 1);
          const frac = u - i0;
          h.pMesh.position.lerpVectors(h.pts[i0], h.pts[i1], frac);
          if (h.isPrimary) {
            this.primaryPos = h.pMesh.position.clone();
            this.primaryTangent = new THREE.Vector3().subVectors(h.pts[i1], h.pts[Math.max(0, i0 - 1)]).normalize();
          }
        });
      }

      update(dt) {
        this.updateParticles(uiState.simTime);
        if (uiState.simTime > 2.4 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateUI();
      }

      updateUI() {
        const p = sceneParams.rutherford;
        const { theta, rMinFm } = this.computeHyperbolaPoints(p.impactParamB);
        const thetaDeg = theta * (180 / Math.PI);

        const pos = this.primaryPos || new THREE.Vector3(-1, 2.2, 0.5);
        const tang = this.primaryTangent || new THREE.Vector3(1, 0, 0);
        const rVec = new THREE.Vector3().subVectors(pos, new THREE.Vector3(0, 2.2, 0));
        const distVis = Math.max(0.45, rVec.length());

        this.arrowVel.update(
          pos,
          tang,
          1.75,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowCoulomb.update(
          pos,
          rVec.clone().normalize(),
          Math.min(2.3, 1.4 / (distVis * distVis)),
          uiState.showVectors,
          uiState.showLabels
        );

        const uPotMev = Math.min(p.alphaEnergyMev * 0.95, p.alphaEnergyMev * (0.45 / distVis));
        const ekMev = Math.max(0.2, p.alphaEnergyMev - uPotMev);

        updateEnergyUI(ekMev, uPotMev, 0, p.alphaEnergyMev, [
          { label: 'Кут розсіяння θ', val: `${thetaDeg.toFixed(1)}°` },
          { label: 'Прицільний параметр b', val: `${p.impactParamB.toFixed(0)} фм` },
          { label: 'Найближче зближення r_min', val: `${rMinFm.toFixed(1)} фм` },
          { label: 'Заряд ядра мішені +Ze', val: `+${p.nuclearZ} e` }
        ]);
      }

      dispose() {
        this.arrowVel.dispose();
        this.arrowCoulomb.dispose();
      }
    }

    // ============================================================================
    // 11y. МОДУЛЬ § 35: ЗАКОН АМПЕРА — ВЗАЄМОДІЯ ПАРАЛЕЛЬНИХ СТРУМІВ
    // ============================================================================
    class AmpereParallelWiresSimulation {
      constructor() {
        this.phaseTriggered = false;
        this.leftCarriers = [];
        this.rightCarriers = [];
        this.fieldRings = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Діелектрична лабораторна платформа стенда Ампера
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(6.8, 0.36, 4.2),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.45, roughness: 0.5 })
        );
        base.position.set(0, 0.18, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Верхня портальна рама з ізоляторами для підвісу гнучких шин
        const topPortal = new THREE.Mesh(
          new THREE.BoxGeometry(5.6, 0.32, 0.8),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.55, roughness: 0.4 })
        );
        topPortal.position.set(0, 5.5, 0);
        worldGroup.add(topPortal);

        [-2.5, 2.5].forEach(x => {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, 5.2, 20),
            new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.3 })
          );
          post.position.set(x, 2.8, -1.2);
          worldGroup.add(post);
        });

        // Дві вертикальні мідні шини зі струмами I₁ та I₂ (вигинаються назустріч або врізнобіч)
        this.leftWireGeo = new THREE.BufferGeometry();
        this.rightWireGeo = new THREE.BufferGeometry();

        const copperMat = new THREE.MeshStandardMaterial({
          color: 0xd97706,
          metalness: 0.78,
          roughness: 0.22
        });
        this.leftWireSegments = [];
        this.rightWireSegments = [];
        for (let s = 0; s < 16; s++) {
          const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.33, 16), copperMat);
          const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.33, 16), copperMat);
          seg1.castShadow = true;
          seg2.castShadow = true;
          worldGroup.add(seg1, seg2);
          this.leftWireSegments.push(seg1);
          this.rightWireSegments.push(seg2);
        }

        // Концентричні магнітні силові лінії B₁ та B₂ навколо обох провідників
        [0.55, 0.95].forEach(rad => {
          [1.8, 3.0, 4.2].forEach(y => {
            const ring1 = new THREE.Mesh(
              new THREE.TorusGeometry(rad, 0.018, 10, 40),
              new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 })
            );
            ring1.rotation.x = Math.PI / 2;
            const ring2 = new THREE.Mesh(
              new THREE.TorusGeometry(rad, 0.018, 10, 40),
              new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 })
            );
            ring2.rotation.x = Math.PI / 2;
            worldGroup.add(ring1, ring2);
            this.fieldRings.push({ ring1, ring2, y });
          });
        });

        // Рухомі носії струму вздовж обох провідників
        const carGeo = new THREE.SphereGeometry(0.11, 12, 12);
        const carMat1 = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        const carMat2 = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        for (let i = 0; i < 10; i++) {
          const m1 = new THREE.Mesh(carGeo, carMat1);
          const m2 = new THREE.Mesh(carGeo, carMat2);
          worldGroup.add(m1, m2);
          this.leftCarriers.push({ mesh: m1, phase: i / 10 });
          this.rightCarriers.push({ mesh: m2, phase: i / 10 });
        }

        this.arrowF12 = new SmartVectorArrow('F₁₂ (сила Ампера)', 0xdc2626, '#dc2626');
        this.arrowF21 = new SmartVectorArrow('F₂₁ (сила Ампера)', 0xdc2626, '#dc2626');
        this.arrowB = new SmartVectorArrow('B (індукція струму)', 0x0284c7, '#0284c7');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      syncVisuals() {
        this.syncWires(uiState.simTime);
        this.updateUI();
      }

      getWireX(side, yNorm, bendAmp) {
        const p = sceneParams.ampere;
        const halfD = p.wireDistD * 0.55;
        const arch = Math.sin(yNorm * Math.PI);
        // При directionSign = +1 (однакові струми) шини притягуються до центра
        const shift = p.directionSign * bendAmp * arch;
        return side < 0 ? -halfD + shift : halfD - shift;
      }

      syncWires(t) {
        const p = sceneParams.ampere;
        const fRatio = (p.current1 * p.current2) / (p.wireDistD * 450);
        const prog = Math.min(1, 0.35 + t * 0.45);
        const bendAmp = Math.min(0.42, fRatio * 0.45) * prog;

        const nSeg = this.leftWireSegments.length;
        for (let s = 0; s < nSeg; s++) {
          const u = (s + 0.5) / nSeg;
          const y = 0.45 + u * 4.9;
          const xL = this.getWireX(-1, u, bendAmp);
          const xR = this.getWireX(1, u, bendAmp);
          this.leftWireSegments[s].position.set(xL, y, 0);
          this.rightWireSegments[s].position.set(xR, y, 0);
        }

        this.fieldRings.forEach(fr => {
          const u = (fr.y - 0.45) / 4.9;
          fr.ring1.position.set(this.getWireX(-1, u, bendAmp), fr.y, 0);
          fr.ring2.position.set(this.getWireX(1, u, bendAmp), fr.y, 0);
          fr.ring1.visible = uiState.showTrails;
          fr.ring2.visible = uiState.showTrails;
        });

        this.leftCarriers.forEach(c => {
          c.mesh.visible = uiState.showParticles;
          const u = (c.phase + t * (p.current1 * 0.035)) % 1.0;
          const y = 0.45 + u * 4.9;
          c.mesh.position.set(this.getWireX(-1, u, bendAmp), y, 0);
        });

        this.rightCarriers.forEach(c => {
          c.mesh.visible = uiState.showParticles;
          const rawU = (c.phase + t * (p.current2 * 0.035)) % 1.0;
          const u = p.directionSign >= 0 ? rawU : 1.0 - rawU;
          const y = 0.45 + u * 4.9;
          c.mesh.position.set(this.getWireX(1, u, bendAmp), y, 0);
        });

        this.midXL = this.getWireX(-1, 0.5, bendAmp);
        this.midXR = this.getWireX(1, 0.5, bendAmp);
      }

      update(dt) {
        this.syncWires(uiState.simTime);
        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateUI();
      }

      updateUI() {
        const p = sceneParams.ampere;
        const b1MicroT = (20 * p.current1) / p.wireDistD;
        const fPerMeterMn = (0.02 * p.current1 * p.current2) / p.wireDistD;
        const dirSign = p.directionSign >= 0 ? 1 : -1;

        const xL = this.midXL || -p.wireDistD * 0.55;
        const xR = this.midXR || p.wireDistD * 0.55;
        const fLen = Math.min(2.1, 0.55 + fPerMeterMn * 1.4);

        this.arrowF12.update(
          new THREE.Vector3(xL, 2.9, 0),
          new THREE.Vector3(dirSign, 0, 0),
          fLen,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowF21.update(
          new THREE.Vector3(xR, 2.9, 0),
          new THREE.Vector3(-dirSign, 0, 0),
          fLen,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowB.update(
          new THREE.Vector3(xR, 2.9, 0),
          new THREE.Vector3(0, 0, -1),
          Math.min(2.0, b1MicroT * 0.008 + 0.6),
          uiState.showVectors,
          uiState.showLabels
        );

        const wMag = 0.5 * (p.current1 * p.current1 + p.current2 * p.current2) * 0.05;
        const wElast = fPerMeterMn * 2.5;

        updateEnergyUI(wMag, wElast, 0, Math.max(1, wMag + wElast), [
          { label: 'Питома сила Ампера F/l', val: `${fPerMeterMn.toFixed(2)} мН/м` },
          { label: 'Індукція поля B₁(d)', val: `${b1MicroT.toFixed(1)} мкТл` },
          { label: 'Струми I₁ / I₂', val: `${p.current1.toFixed(1)} / ${p.current2.toFixed(1)} А` },
          { label: 'Характер взаємодії', val: dirSign > 0 ? 'Притягання (↑↑)' : 'Відштовхування (↑↓)' }
        ]);
      }

      dispose() {
        this.arrowF12.dispose();
        this.arrowF21.dispose();
        this.arrowB.dispose();
      }
    }

    // ============================================================================
    // 11z. МОДУЛЬ § 36: ЕФЕКТ ХОЛЛА В НАПІВПРОВІДНИКАХ І МЕТАЛАХ
    // ============================================================================
    class HallEffectSimulation {
      constructor() {
        this.phaseTriggered = false;
        this.carriers = [];
        this.edgeCharges = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        // Лабораторний стенд датчика Холла з полюсами електромагніта та мілівольтметром
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(7.6, 0.34, 4.6),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.45, roughness: 0.52 })
        );
        base.position.set(0, 0.17, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Нижній Північний полюс магніту (N, червоний) та верхній Південний полюс (S, синій, напівпрозорий)
        const northPole = new THREE.Mesh(
          new THREE.CylinderGeometry(1.8, 1.9, 0.7, 32),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.45, roughness: 0.4 })
        );
        northPole.position.set(0, 0.7, 0);
        worldGroup.add(northPole);

        const southPole = new THREE.Mesh(
          new THREE.CylinderGeometry(1.8, 1.8, 0.65, 32),
          new THREE.MeshPhysicalMaterial({
            color: 0x2563eb,
            transparent: true,
            opacity: 0.28,
            roughness: 0.15,
            depthWrite: false
          })
        );
        southPole.position.set(0, 4.35, 0);
        worldGroup.add(southPole);

        // Напівпровідникова пластинка датчика Холла вздовж осі X (між x = -2.6 та x = +2.6)
        this.waferMesh = new THREE.Mesh(
          new THREE.BoxGeometry(5.2, 0.24, 2.5),
          new THREE.MeshPhysicalMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.36,
            roughness: 0.12,
            metalness: 0.1,
            depthWrite: false
          })
        );
        this.waferMesh.position.set(0, 2.3, 0);
        worldGroup.add(this.waferMesh);

        // Поздовжні струмові контакти (лівий і правий) та поперечні холлівські зонди (передній і задній)
        [-2.7, 2.7].forEach(x => {
          const contact = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.3, 2.55),
            new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.22 })
          );
          contact.position.set(x, 2.3, 0);
          worldGroup.add(contact);
        });

        [-1.32, 1.32].forEach(z => {
          const probe = new THREE.Mesh(
            new THREE.BoxGeometry(0.75, 0.28, 0.16),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.82, roughness: 0.2 })
          );
          probe.position.set(0, 2.3, z);
          worldGroup.add(probe);
        });

        // Індикатори накопичених поверхневих зарядів на бічних гранях пластинки (створюють поле Холла E_H)
        const edgeGeo = new THREE.SphereGeometry(0.075, 10, 10);
        for (let i = 0; i < 8; i++) {
          const x = -1.9 + (i / 7) * 3.8;
          const frontMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
          const backMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
          const frontCharge = new THREE.Mesh(edgeGeo, frontMat);
          const backCharge = new THREE.Mesh(edgeGeo, backMat);
          frontCharge.position.set(x, 2.3, 1.18);
          backCharge.position.set(x, 2.3, -1.18);
          worldGroup.add(frontCharge, backCharge);
          this.edgeCharges.push({ frontCharge, backCharge });
        }

        // Носії заряду (електрони або дірки), що дрейфують уздовж пластинки і відхиляються силою Лоренца до грані
        const carGeo = new THREE.SphereGeometry(0.095, 14, 14);
        for (let j = 0; j < 28; j++) {
          const mat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 0.55
          });
          const mesh = new THREE.Mesh(carGeo, mat);
          worldGroup.add(mesh);
          this.carriers.push({
            mesh,
            phase: j / 28,
            zLane: ((j % 5) - 2) * 0.36
          });
        }

        this.arrowVd = new SmartVectorArrow('v_d (дрейф носіїв)', 0x16a34a, '#16a34a');
        this.arrowLorentz = new SmartVectorArrow('F_Л (сила Лоренца)', 0xd97706, '#d97706');
        this.arrowHallE = new SmartVectorArrow('E_H (поле Холла)', 0xdc2626, '#dc2626');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      syncVisuals() {
        this.updateCarriers(uiState.simTime);
        this.updateUI();
      }

      getHallMetrics() {
        const p = sceneParams.hall;
        const rHall = 10.0 / p.carrierConcN;
        const uHallMv = (rHall * p.currentI * p.magFieldB) / p.slabThickD;
        const eHallVm = uHallMv / 2.5;
        const vDrift = p.currentI / (p.carrierConcN * p.slabThickD);
        return { rHall, uHallMv, eHallVm, vDrift };
      }

      updateCarriers(t) {
        const p = sceneParams.hall;
        const { vDrift } = this.getHallMetrics();
        const isHole = p.carrierSign > 0;

        this.waferMesh.scale.set(1, p.slabThickD / 1.0, 1);

        // Колір бічних накопичених зарядів залежить від типу провідності (n-тип або p-тип)
        this.edgeCharges.forEach(ec => {
          ec.frontCharge.visible = uiState.showTrails;
          ec.backCharge.visible = uiState.showTrails;
          ec.frontCharge.material.color.setHex(isHole ? 0xef4444 : 0x3b82f6);
          ec.backCharge.material.color.setHex(isHole ? 0x3b82f6 : 0xef4444);
        });

        this.carriers.forEach(c => {
          c.mesh.visible = uiState.showParticles;
          c.mesh.material.color.setHex(isHole ? 0xef4444 : 0x38bdf8);
          c.mesh.material.emissive.setHex(isHole ? 0xb91c1c : 0x0284c7);

          const rawU = (c.phase + t * Math.min(0.85, 0.22 * vDrift)) % 1.0;
          const u = isHole ? rawU : 1.0 - rawU;
          const x = -2.45 + u * 4.9;
          // Дуга початкового відхилення під дією сили Лоренца до передньої грані (+Z)
          const deflectZ = Math.min(0.42, p.magFieldB * 0.14) * Math.sin(rawU * Math.PI);
          c.mesh.position.set(x, 2.3, c.zLane + deflectZ);
        });
      }

      update(dt) {
        this.updateCarriers(uiState.simTime);
        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
        this.updateUI();
      }

      updateUI() {
        const p = sceneParams.hall;
        const { rHall, uHallMv, eHallVm, vDrift } = this.getHallMetrics();
        const isHole = p.carrierSign > 0;

        this.arrowVd.update(
          new THREE.Vector3(0, 2.55, 0),
          new THREE.Vector3(isHole ? 1 : -1, 0, 0),
          Math.min(2.1, 0.65 + vDrift * 0.45),
          uiState.showVectors,
          uiState.showLabels
        );

        // Обидва типи носіїв відхиляються силою Лоренца q[v_d × B] до однієї й тієї ж грані (+Z)!
        this.arrowLorentz.update(
          new THREE.Vector3(-0.35, 2.55, 0),
          new THREE.Vector3(0, 0, 1),
          Math.min(2.0, 0.55 + uHallMv * 0.05),
          uiState.showVectors,
          uiState.showLabels
        );

        // Рівноважне поле Холла E_H змінює знак залежно від знака носіїв заряду!
        this.arrowHallE.update(
          new THREE.Vector3(0.35, 2.55, 0),
          new THREE.Vector3(0, 0, isHole ? -1 : 1),
          Math.min(2.0, 0.55 + uHallMv * 0.05),
          uiState.showVectors,
          uiState.showLabels
        );

        const wHall = uHallMv * 0.6;
        const wDrift = vDrift * 8.0;

        updateEnergyUI(wHall, wDrift, 0, Math.max(1, wHall + wDrift), [
          { label: 'Напруга Холла U_H', val: `${(isHole ? uHallMv : -uHallMv).toFixed(1)} мВ` },
          { label: 'Поперечне поле E_H', val: `${eHallVm.toFixed(1)} В/м` },
          { label: 'Стала Холла |R_H|', val: `${rHall.toFixed(2)} см³/Кл` },
          { label: 'Тип провідності', val: isHole ? 'p-тип (дірки +e)' : 'n-тип (електрони -e)' }
        ]);
      }

      dispose() {
        this.arrowVd.dispose();
        this.arrowLorentz.dispose();
        this.arrowHallE.dispose();
      }
    }

    // ============================================================================
    // 37. МОДУЛЬ § 37: ЗВ'ЯЗАНІ МАЯТНИКИ ТА ЯВИЩЕ БИТТЯ (НОРМАЛЬНІ МОДИ)
    // ============================================================================
    class CoupledPendulumsSimulation {
      constructor() {
        this.springCoils = [];
        this.energyBeads = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(11.5, 0.36, 4.2),
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.65 })
        );
        base.position.set(0, 0.18, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.72, roughness: 0.3 });
        [-4.6, 4.6].forEach(x => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 6.2, 20), postMat);
          post.position.set(x, 3.25, 0);
          post.castShadow = true;
          worldGroup.add(post);
        });

        const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 9.8, 20), postMat);
        crossbar.rotation.z = Math.PI / 2;
        crossbar.position.set(0, 6.25, 0);
        crossbar.castShadow = true;
        worldGroup.add(crossbar);

        // Два маятники на шарнірах x = -1.8 та x = +1.8
        const rodMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6, roughness: 0.35 });
        this.rod1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 14), rodMat);
        this.rod2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 14), rodMat);
        worldGroup.add(this.rod1, this.rod2);

        this.bob1 = new THREE.Mesh(
          new THREE.SphereGeometry(0.45, 28, 28),
          new THREE.MeshStandardMaterial({ color: 0x166534, metalness: 0.45, roughness: 0.25 })
        );
        this.bob2 = new THREE.Mesh(
          new THREE.SphereGeometry(0.45, 28, 28),
          new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.45, roughness: 0.25 })
        );
        this.bob1.castShadow = true;
        this.bob2.castShadow = true;
        worldGroup.add(this.bob1, this.bob2);

        // З'єднувальна спіральна пружина між стрижнями маятників
        const springMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.78, roughness: 0.25 });
        const segGeo = new THREE.SphereGeometry(0.065, 10, 10);
        for (let i = 0; i < 36; i++) {
          const seg = new THREE.Mesh(segGeo, springMat);
          worldGroup.add(seg);
          this.springCoils.push(seg);
        }

        // Індикатори потоку енергії вздовж пружини
        const beadGeo = new THREE.SphereGeometry(0.08, 12, 12);
        const beadMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        for (let i = 0; i < 8; i++) {
          const b = new THREE.Mesh(beadGeo, beadMat);
          worldGroup.add(b);
          this.energyBeads.push(b);
        }

        // Дугові шкали відхилення внизу
        const scaleArcGeo = new THREE.BoxGeometry(3.2, 0.04, 0.35);
        const scaleArcMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 });
        this.arc1 = new THREE.Mesh(scaleArcGeo, scaleArcMat);
        this.arc2 = new THREE.Mesh(scaleArcGeo, scaleArcMat);
        this.arc1.position.set(-1.9, 0.38, 0);
        this.arc2.position.set(1.9, 0.38, 0);
        worldGroup.add(this.arc1, this.arc2);

        this.arrowV1 = new SmartVectorArrow('v₁ (маятник 1)', 0x166534, '#166534');
        this.arrowV2 = new SmartVectorArrow('v₂ (маятник 2)', 0x1d4ed8, '#1d4ed8');
        this.arrowSpring = new SmartVectorArrow('F_зв (пружина)', 0xb45309, '#b45309');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      getStateAt(t) {
        const p = sceneParams.coupled;
        const w1 = Math.sqrt(9.81 / p.pendLength);
        const w2 = Math.sqrt(9.81 / p.pendLength + (2 * p.springK) / p.bobMass);
        const amp = 0.34;
        let theta1 = 0;
        let theta2 = 0;
        let omega1Val = 0;
        let omega2Val = 0;

        if (p.initMode === 1) {
          // Синфазна нормальна мода
          theta1 = amp * Math.cos(w1 * t);
          theta2 = amp * Math.cos(w1 * t);
          omega1Val = -amp * w1 * Math.sin(w1 * t);
          omega2Val = -amp * w1 * Math.sin(w1 * t);
        } else if (p.initMode === -1) {
          // Протифазна нормальна мода
          theta1 = amp * Math.cos(w2 * t);
          theta2 = -amp * Math.cos(w2 * t);
          omega1Val = -amp * w2 * Math.sin(w2 * t);
          omega2Val = amp * w2 * Math.sin(w2 * t);
        } else {
          // Режим биття: суперпозиція двох нормальних мод
          theta1 = 0.5 * amp * (Math.cos(w1 * t) + Math.cos(w2 * t));
          theta2 = 0.5 * amp * (Math.cos(w1 * t) - Math.cos(w2 * t));
          omega1Val = -0.5 * amp * (w1 * Math.sin(w1 * t) + w2 * Math.sin(w2 * t));
          omega2Val = -0.5 * amp * (w1 * Math.sin(w1 * t) - w2 * Math.sin(w2 * t));
        }
        return { w1, w2, theta1, theta2, omega1Val, omega2Val };
      }

      syncVisuals() {
        const p = sceneParams.coupled;
        const { w1, w2, theta1, theta2 } = this.getStateAt(uiState.simTime);
        const L = p.pendLength * 1.35;
        const pivotY = 6.25;
        const x1Pivot = -1.9;
        const x2Pivot = 1.9;

        const x1 = x1Pivot + L * Math.sin(theta1);
        const y1 = pivotY - L * Math.cos(theta1);
        const x2 = x2Pivot + L * Math.sin(theta2);
        const y2 = pivotY - L * Math.cos(theta2);

        const sBob = 0.82 + 0.14 * p.bobMass;
        this.bob1.scale.setScalar(sBob);
        this.bob2.scale.setScalar(sBob);
        this.bob1.position.set(x1, y1, 0);
        this.bob2.position.set(x2, y2, 0);

        this.rod1.scale.set(1, L, 1);
        this.rod1.position.set((x1Pivot + x1) * 0.5, (pivotY + y1) * 0.5, 0);
        this.rod1.rotation.z = theta1;

        this.rod2.scale.set(1, L, 1);
        this.rod2.position.set((x2Pivot + x2) * 0.5, (pivotY + y2) * 0.5, 0);
        this.rod2.rotation.z = theta2;

        // Положення пружини на середині висоти підвісів
        const spX1 = x1Pivot + 0.55 * L * Math.sin(theta1);
        const spY1 = pivotY - 0.55 * L * Math.cos(theta1);
        const spX2 = x2Pivot + 0.55 * L * Math.sin(theta2);
        const spY2 = pivotY - 0.55 * L * Math.cos(theta2);

        const n = this.springCoils.length;
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          const rCoil = (i > 2 && i < n - 3) ? 0.16 : 0.0;
          const angle = u * Math.PI * 16;
          this.springCoils[i].position.set(
            spX1 + (spX2 - spX1) * u,
            spY1 + (spY2 - spY1) * u + Math.sin(angle) * rCoil,
            Math.cos(angle) * rCoil
          );
        }

        const omegaBeat = (w2 - w1) * 0.5;
        const flowDir = Math.abs(p.initMode) < 0.5 ? Math.sign(Math.sin(2 * omegaBeat * uiState.simTime)) : 0;
        this.energyBeads.forEach((b, idx) => {
          b.visible = uiState.showParticles && Math.abs(p.initMode) < 0.5;
          let u = ((idx / this.energyBeads.length) + uiState.simTime * 0.7 * (flowDir || 1)) % 1.0;
          if (u < 0) u += 1.0;
          b.position.set(
            spX1 + (spX2 - spX1) * u,
            spY1 + (spY2 - spY1) * u,
            0.22
          );
        });

        this.arc1.visible = uiState.showTrails;
        this.arc2.visible = uiState.showTrails;
        this.updateUI();
      }

      update(dt) {
        this.syncVisuals();
        if (uiState.simTime > 2.4 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
      }

      updateUI() {
        const p = sceneParams.coupled;
        const { w1, w2, theta1, theta2, omega1Val, omega2Val } = this.getStateAt(uiState.simTime);
        const v1 = omega1Val * p.pendLength;
        const v2 = omega2Val * p.pendLength;
        const dxSpring = p.pendLength * (Math.sin(theta2) - Math.sin(theta1));
        const fSpring = p.springK * dxSpring;

        this.arrowV1.update(
          this.bob1.position.clone().add(new THREE.Vector3(0, -0.5, 0)),
          new THREE.Vector3(v1 >= 0 ? 1 : -1, 0, 0),
          Math.min(2.2, Math.abs(v1) * 1.4),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowV2.update(
          this.bob2.position.clone().add(new THREE.Vector3(0, -0.5, 0)),
          new THREE.Vector3(v2 >= 0 ? 1 : -1, 0, 0),
          Math.min(2.2, Math.abs(v2) * 1.4),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowSpring.update(
          new THREE.Vector3(0, 4.1, 0.3),
          new THREE.Vector3(fSpring >= 0 ? 1 : -1, 0, 0),
          Math.min(2.0, Math.abs(fSpring) * 0.8),
          uiState.showVectors,
          uiState.showLabels
        );

        const e1 = 0.5 * p.bobMass * (v1 * v1 + 9.81 * p.pendLength * theta1 * theta1) * 10;
        const e2 = 0.5 * p.bobMass * (v2 * v2 + 9.81 * p.pendLength * theta2 * theta2) * 10;
        const uSpring = 0.5 * p.springK * dxSpring * dxSpring * 10;
        const tBeat = (2 * Math.PI) / Math.max(0.05, w2 - w1);

        updateEnergyUI(e1, e2, uSpring, Math.max(0.5, e1 + e2 + uSpring), [
          { label: 'Синфазна частота ω₁', val: `${w1.toFixed(2)} рад/с` },
          { label: 'Протифазна частота ω₂', val: `${w2.toFixed(2)} рад/с` },
          { label: 'Період биття T_б', val: `${tBeat.toFixed(2)} с` },
          { label: 'Кут θ₁ / θ₂', val: `${((theta1 * 180) / Math.PI).toFixed(1)}° / ${((theta2 * 180) / Math.PI).toFixed(1)}°` }
        ]);
      }

      dispose() {
        this.arrowV1.dispose();
        this.arrowV2.dispose();
        this.arrowSpring.dispose();
      }
    }

    // ============================================================================
    // 38. МОДУЛЬ § 38: ГІРОСКОПІЧНА ПРЕЦЕСІЯ ВАЖКОЇ СИМЕТРИЧНОЇ ДЗИҐИ
    // ============================================================================
    class GyroscopePrecessionSimulation {
      constructor() {
        this.sparkParticles = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const pedestal = new THREE.Mesh(
          new THREE.CylinderGeometry(2.6, 3.0, 0.42, 36),
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.6 })
        );
        pedestal.position.set(0, 0.21, 0);
        pedestal.receiveShadow = true;
        worldGroup.add(pedestal);

        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75, roughness: 0.28 });
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 24), pillarMat);
        pillar.position.set(0, 1.3, 0);
        pillar.castShadow = true;
        worldGroup.add(pillar);

        const pivotBall = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 20), pillarMat);
        pivotBall.position.set(0, 2.4, 0);
        worldGroup.add(pivotBall);

        // Група прецесії (обертається навколо вертикальної осі Y у точці (0, 2.4, 0))
        this.precessionGroup = new THREE.Group();
        this.precessionGroup.position.set(0, 2.4, 0);
        worldGroup.add(this.precessionGroup);

        // Група нахилу осі ротора на кут нутації θ
        this.tiltGroup = new THREE.Group();
        this.precessionGroup.add(this.tiltGroup);

        const shaftMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.2 });
        this.shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 3.6, 18), shaftMat);
        this.shaftMesh.position.set(0, 1.4, 0);
        this.tiltGroup.add(this.shaftMesh);

        // Противага внизу осі
        const counterWeight = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, 0.32, 20),
          new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 })
        );
        counterWeight.position.set(0, -0.3, 0);
        this.tiltGroup.add(counterWeight);

        // Масивний латунний маховик гіроскопа з радіальними спицями для візуалізації власного обертання ω
        this.rotorGroup = new THREE.Group();
        this.tiltGroup.add(this.rotorGroup);

        const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.82, roughness: 0.22 });
        const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.22, 20, 48), brassMat);
        rimMesh.rotation.x = Math.PI / 2;
        rimMesh.castShadow = true;
        this.rotorGroup.add(rimMesh);

        const discMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(1.18, 1.18, 0.14, 36),
          new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.65, roughness: 0.32 })
        );
        this.rotorGroup.add(discMesh);

        const stripeMat = new THREE.MeshBasicMaterial({ color: 0x1e3a5f });
        for (let i = 0; i < 6; i++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, 0.08), stripeMat);
          spoke.rotation.y = (i * Math.PI) / 6;
          this.rotorGroup.add(spoke);
        }

        // Кільце траєкторії прецесії кінця осі
        this.coneRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.5, 0.03, 12, 64),
          new THREE.MeshBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.55 })
        );
        this.coneRing.rotation.x = Math.PI / 2;
        worldGroup.add(this.coneRing);

        // Маркери кутової швидкості вздовж обода маховика
        const pGeo = new THREE.SphereGeometry(0.07, 10, 10);
        const pMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        for (let i = 0; i < 12; i++) {
          const sp = new THREE.Mesh(pGeo, pMat);
          this.rotorGroup.add(sp);
          this.sparkParticles.push({ mesh: sp, angle: (i / 12) * Math.PI * 2 });
        }

        this.arrowL = new SmartVectorArrow('L (момент імпульсу)', 0x166534, '#166534');
        this.arrowTorque = new SmartVectorArrow('M = [r × mg] (момент)', 0xd97706, '#d97706');
        this.arrowOmegaP = new SmartVectorArrow('Ω_прец (прецесія)', 0x1d4ed8, '#1d4ed8');
      }

      reset() {
        this.phaseTriggered = false;
        this.precAngle = 0;
        this.spinAngle = 0;
        this.syncVisuals();
      }

      getGyroMetrics() {
        const p = sceneParams.precession;
        const rRotor = 1.15;
        const iSpin = 0.5 * p.rotorMass * rRotor * rRotor;
        const lSpin = iSpin * p.spinOmega;
        const thetaRad = (p.tiltDeg * Math.PI) / 180;
        const torqueM = p.rotorMass * 9.81 * p.pivotArmD * Math.sin(thetaRad);
        const omegaPrec = (p.rotorMass * 9.81 * p.pivotArmD) / Math.max(0.5, lSpin);
        return { iSpin, lSpin, thetaRad, torqueM, omegaPrec };
      }

      syncVisuals() {
        const p = sceneParams.precession;
        const { thetaRad } = this.getGyroMetrics();

        this.precessionGroup.rotation.y = this.precAngle || 0;
        this.tiltGroup.rotation.z = -thetaRad;

        const dVisual = 0.9 + p.pivotArmD * 0.75;
        this.rotorGroup.position.set(0, dVisual, 0);
        const mScale = 0.82 + p.rotorMass * 0.1;
        this.rotorGroup.scale.set(mScale, 1, mScale);
        this.rotorGroup.rotation.y = this.spinAngle || 0;

        const tipR = 2.8 * Math.sin(thetaRad);
        const tipY = 2.4 + 2.8 * Math.cos(thetaRad);
        this.coneRing.visible = uiState.showTrails;
        this.coneRing.scale.set(tipR / 1.5, tipR / 1.5, 1);
        this.coneRing.position.set(0, tipY, 0);

        this.sparkParticles.forEach(s => {
          s.mesh.visible = uiState.showParticles;
          s.mesh.position.set(Math.cos(s.angle) * 1.32, 0.12, Math.sin(s.angle) * 1.32);
        });

        this.updateUI();
      }

      update(dt) {
        const p = sceneParams.precession;
        const { omegaPrec } = this.getGyroMetrics();
        this.precAngle = (this.precAngle || 0) + omegaPrec * dt;
        this.spinAngle = (this.spinAngle || 0) + p.spinOmega * 0.35 * dt;
        this.syncVisuals();

        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
      }

      updateUI() {
        const p = sceneParams.precession;
        const { iSpin, lSpin, thetaRad, torqueM, omegaPrec } = this.getGyroMetrics();
        const phi = this.precAngle || 0;

        // Одиничний вектор уздовж осі ротора
        const axisDir = new THREE.Vector3(
          Math.sin(thetaRad) * Math.cos(phi),
          Math.cos(thetaRad),
          -Math.sin(thetaRad) * Math.sin(phi)
        ).normalize();

        // Вектор моменту сили тяжіння M = [r × mg] перпендикулярний до площини нахилу (дотичний до кола прецесії)
        const torqueDir = new THREE.Vector3(-Math.sin(phi), 0, -Math.cos(phi)).normalize();

        const pivotPos = new THREE.Vector3(0, 2.4, 0);
        const tipPos = pivotPos.clone().addScaledVector(axisDir, 2.5);

        this.arrowL.update(
          tipPos,
          axisDir,
          Math.min(2.2, 0.8 + lSpin * 0.02),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowTorque.update(
          tipPos,
          torqueDir,
          Math.min(2.0, 0.6 + torqueM * 0.06),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowOmegaP.update(
          new THREE.Vector3(0, 2.4, 0),
          new THREE.Vector3(0, 1, 0),
          Math.min(2.2, 0.8 + omegaPrec * 0.9),
          uiState.showVectors,
          uiState.showLabels
        );

        const eSpin = 0.5 * iSpin * p.spinOmega * p.spinOmega * 0.02;
        const ePrec = 0.5 * (iSpin + p.rotorMass * p.pivotArmD * p.pivotArmD) * omegaPrec * omegaPrec * 2.0;
        const uGrav = p.rotorMass * 9.81 * p.pivotArmD * Math.cos(thetaRad) * 0.5;

        updateEnergyUI(eSpin, ePrec, Math.max(0, uGrav), Math.max(1, eSpin + ePrec + uGrav), [
          { label: 'Власний момент L = Iω', val: `${lSpin.toFixed(1)} кг·м²/с` },
          { label: 'Момент сили тяжіння M', val: `${torqueM.toFixed(1)} Н·м` },
          { label: 'Швидкість прецесії Ω', val: `${omegaPrec.toFixed(2)} рад/с` },
          { label: 'Період прецесії T_пр', val: `${((2 * Math.PI) / Math.max(0.05, omegaPrec)).toFixed(1)} с` }
        ]);
      }

      dispose() {
        this.arrowL.dispose();
        this.arrowTorque.dispose();
        this.arrowOmegaP.dispose();
      }
    }

    // ============================================================================
    // 39. МОДУЛЬ § 39: ЕФЕКТ МАГНУСА ТА ПІДІЙМАЛЬНА СИЛА ОБЕРТОВОГО ЦИЛІНДРА
    // ============================================================================
    class MagnusEffectSimulation {
      constructor() {
        this.streamLines = [];
        this.flowTracers = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const windTunnelBase = new THREE.Mesh(
          new THREE.BoxGeometry(14.5, 0.35, 5.2),
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.65 })
        );
        windTunnelBase.position.set(0, 0.175, 0);
        windTunnelBase.receiveShadow = true;
        worldGroup.add(windTunnelBase);

        // Обертовий циліндр (ротор Флеттнера) в аеродинамічній трубі
        this.rotorGroup = new THREE.Group();
        this.rotorGroup.position.set(0, 3.0, 0);
        worldGroup.add(this.rotorGroup);

        const cylMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, metalness: 0.55, roughness: 0.32 });
        const cylMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.8, 36), cylMat);
        cylMesh.rotation.x = Math.PI / 2;
        cylMesh.castShadow = true;
        this.rotorGroup.add(cylMesh);

        // Поздовжні маркерні смуги на роторі для чіткого бачення кутової швидкості ω
        const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.86), stripeMat);
          bar.position.set(Math.cos(a) * 0.98, Math.sin(a) * 0.98, 0);
          this.rotorGroup.add(bar);
        }

        // Лінії течії (streamlines), які згущуються з боку попутного обертання за законом Бернуллі
        const lineOffsets = [-1.8, -1.25, -0.75, 0.75, 1.25, 1.8];
        lineOffsets.forEach(y0 => {
          const pts = [];
          for (let i = 0; i <= 60; i++) pts.push(new THREE.Vector3(-6.5 + (i / 60) * 13.0, 3.0 + y0, 0));
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.65 });
          const line = new THREE.Line(geo, mat);
          worldGroup.add(line);
          this.streamLines.push({ line, y0 });
        });

        // Частинки-трекери повітряного потоку
        const trGeo = new THREE.SphereGeometry(0.085, 12, 12);
        const trMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.45 });
        for (let i = 0; i < 42; i++) {
          const mesh = new THREE.Mesh(trGeo, trMat);
          worldGroup.add(mesh);
          this.flowTracers.push({
            mesh,
            laneIdx: i % lineOffsets.length,
            phase: (i / 42)
          });
        }

        this.arrowFlow = new SmartVectorArrow('v_∞ (потік повітря)', 0x0284c7, '#0284c7');
        this.arrowLift = new SmartVectorArrow('F_Магнуса (підіймальна)', 0x16a34a, '#16a34a');
        this.arrowSpin = new SmartVectorArrow('ω (обертання циліндра)', 0xd97706, '#d97706');
      }

      reset() {
        this.phaseTriggered = false;
        this.rotorAngle = 0;
        this.syncVisuals();
      }

      getStreamY(x, y0, rCyl, circulationFactor) {
        const r2 = x * x + y0 * y0 + 0.35;
        const dipoleDeflect = (y0 * rCyl * rCyl * 0.85) / r2;
        const vortexLift = -circulationFactor * Math.exp(-(x * x) / (3.8 * rCyl * rCyl)) * 0.45;
        return 3.0 + y0 + dipoleDeflect + vortexLift;
      }

      syncVisuals() {
        const p = sceneParams.magnus;
        const rScale = p.cylRadius / 1.2;
        this.rotorGroup.scale.set(rScale, rScale, 1);
        this.rotorGroup.rotation.z = -(this.rotorAngle || 0);

        const circFactor = (p.spinOmega / 25.0) * rScale;

        this.streamLines.forEach(sl => {
          sl.line.visible = uiState.showTrails;
          const pos = sl.line.geometry.attributes.position;
          for (let i = 0; i <= 60; i++) {
            const x = -6.5 + (i / 60) * 13.0;
            const y = this.getStreamY(x, sl.y0, p.cylRadius, circFactor);
            pos.setXYZ(i, x, y, 0);
          }
          pos.needsUpdate = true;
        });

        this.flowTracers.forEach(tr => {
          tr.mesh.visible = uiState.showParticles;
          const sl = this.streamLines[tr.laneIdx];
          const localSpeed = 1.0 + (sl.y0 > 0 ? 1 : -1) * circFactor * 0.22;
          const u = (tr.phase + uiState.simTime * p.flowSpeed * 0.055 * Math.max(0.35, localSpeed)) % 1.0;
          const x = -6.5 + u * 13.0;
          const y = this.getStreamY(x, sl.y0, p.cylRadius, circFactor);
          tr.mesh.position.set(x, y, ((tr.laneIdx % 3) - 1) * 0.65);
        });

        this.updateUI();
      }

      update(dt) {
        const p = sceneParams.magnus;
        this.rotorAngle = (this.rotorAngle || 0) + p.spinOmega * 0.14 * dt;
        this.syncVisuals();

        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
      }

      updateUI() {
        const p = sceneParams.magnus;
        const rM = p.cylRadius * 0.1;
        const gamma = 2 * Math.PI * rM * rM * p.spinOmega;
        const fMagnus = p.airDensity * p.flowSpeed * gamma * 2.5;
        const vSurf = Math.abs(p.spinOmega) * rM;
        const vTop = p.flowSpeed + p.spinOmega * rM;
        const vBot = p.flowSpeed - p.spinOmega * rM;
        const deltaP = 0.5 * p.airDensity * (vTop * vTop - vBot * vBot);

        this.arrowFlow.update(
          new THREE.Vector3(-5.2, 3.0, 0),
          new THREE.Vector3(1, 0, 0),
          Math.min(2.3, 0.6 + p.flowSpeed * 0.11),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowLift.update(
          new THREE.Vector3(0, 3.0, 0),
          new THREE.Vector3(0, fMagnus >= 0 ? 1 : -1, 0),
          Math.min(2.5, Math.abs(fMagnus) * 0.35),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowSpin.update(
          new THREE.Vector3(0, 3.0, 1.5),
          new THREE.Vector3(0, 0, p.spinOmega >= 0 ? -1 : 1),
          Math.min(1.9, Math.abs(p.spinOmega) * 0.045),
          uiState.showVectors,
          uiState.showLabels
        );

        const eFlow = 0.5 * p.airDensity * p.flowSpeed * p.flowSpeed;
        const eRot = 0.5 * p.spinOmega * p.spinOmega * rM * rM * 15;
        const wLift = Math.abs(fMagnus) * 4.0;

        updateEnergyUI(eFlow, eRot, wLift, Math.max(1, eFlow + eRot + wLift), [
          { label: 'Сила Магнуса F_M', val: `${fMagnus.toFixed(2)} Н` },
          { label: 'Циркуляція швидкості Γ', val: `${gamma.toFixed(2)} м²/с` },
          { label: 'Перепад тиску ΔP', val: `${deltaP.toFixed(1)} Па` },
          { label: 'Лінійна швидкість ωR', val: `${vSurf.toFixed(2)} м/с` }
        ]);
      }

      dispose() {
        this.arrowFlow.dispose();
        this.arrowLift.dispose();
        this.arrowSpin.dispose();
      }
    }

    // ============================================================================
    // 40. МОДУЛЬ § 40: ПОВЕРХНЕВИЙ НАТЯГ І КАПІЛЯРНЕ ПІДНЯТТЯ (ФОРМУЛА ЖЮРЕНА)
    // ============================================================================
    class CapillaryRiseSimulation {
      constructor() {
        this.molecules = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(10.5, 0.35, 5.0),
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.65 })
        );
        base.position.set(0, 0.175, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.30,
          roughness: 0.08,
          side: THREE.FrontSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1
        });

        // Широка кювета з рідиною
        const basinWall = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 2.3, 36, 1, true), glassMat);
        basinWall.position.set(0, 1.51, 0);
        basinWall.renderOrder = 4;
        worldGroup.add(basinWall);

        this.basinLiquid = new THREE.Mesh(
          new THREE.CylinderGeometry(2.50, 2.50, 1.28, 36),
          new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            emissive: 0x0369a1,
            emissiveIntensity: 0.15,
            transparent: true,
            opacity: 0.68,
            roughness: 0.2,
            side: THREE.FrontSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: 2,
            polygonOffsetUnits: 2
          })
        );
        this.basinLiquid.position.set(0, 1.0, 0);
        this.basinLiquid.renderOrder = 1;
        worldGroup.add(this.basinLiquid);

        this.basinSurfaceDisk = new THREE.Mesh(
          new THREE.CircleGeometry(2.49, 36),
          new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        this.basinSurfaceDisk.rotation.x = -Math.PI / 2;
        this.basinSurfaceDisk.position.set(0, 1.645, 0);
        this.basinSurfaceDisk.renderOrder = 2;
        worldGroup.add(this.basinSurfaceDisk);

        // Скляна капілярна трубка у центрі
        this.capillaryTube = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 5.4, 28, 1, true), glassMat);
        this.capillaryTube.position.set(0, 3.3, 0);
        this.capillaryTube.renderOrder = 5;
        worldGroup.add(this.capillaryTube);

        // Стовпчик рідини всередині капіляра
        this.columnMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.38, 0.38, 1.0, 28),
          new THREE.MeshStandardMaterial({
            color: 0x0369a1,
            emissive: 0x0284c7,
            emissiveIntensity: 0.18,
            transparent: true,
            opacity: 0.84,
            roughness: 0.18,
            side: THREE.FrontSide,
            depthWrite: false
          })
        );
        this.columnMesh.renderOrder = 3;
        worldGroup.add(this.columnMesh);

        // Меніск на вершині стовпчика (півсфера без перекриття бічної стінки стовпчика)
        this.meniscusMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.38, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            roughness: 0.15,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        this.meniscusMesh.renderOrder = 4;
        worldGroup.add(this.meniscusMesh);

        // Вимірювальна міліметрова рейка поруч із капіляром
        const ruler = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 5.2, 0.08),
          new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5 })
        );
        ruler.position.set(1.35, 3.3, 0);
        worldGroup.add(ruler);

        for (let i = 0; i <= 10; i++) {
          const tick = new THREE.Mesh(
            new THREE.BoxGeometry(i % 2 === 0 ? 0.26 : 0.15, 0.025, 0.1),
            new THREE.MeshBasicMaterial({ color: 0x1c1917 })
          );
          tick.position.set(1.28, 1.0 + i * 0.45, 0);
          worldGroup.add(tick);
        }

        // Молекули поверхневого шару вздовж периметра меніска
        const molGeo = new THREE.SphereGeometry(0.065, 10, 10);
        const molMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        for (let i = 0; i < 16; i++) {
          const m = new THREE.Mesh(molGeo, molMat);
          worldGroup.add(m);
          this.molecules.push({ mesh: m, angle: (i / 16) * Math.PI * 2 });
        }

        this.arrowSigma = new SmartVectorArrow('F_σ (поверхневий натяг)', 0x16a34a, '#16a34a');
        this.arrowWeight = new SmartVectorArrow('mg (стовпчик рідини)', 0xdc2626, '#dc2626');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      getCapillaryMetrics() {
        const p = sceneParams.capillary;
        const thetaRad = (p.contactAngle * Math.PI) / 180;
        const cosTheta = Math.cos(thetaRad);
        const sigma = p.sigmaMilli * 0.001;
        const rM = p.tubeRadiusMm * 0.001;
        const rho = p.fluidRho * 1000;
        const hMeters = (2 * sigma * cosTheta) / (rho * 9.81 * rM);
        const hMm = hMeters * 1000;
        const laplacePa = (2 * sigma * cosTheta) / rM;
        const fSurfaceMn = 2 * Math.PI * p.tubeRadiusMm * p.sigmaMilli * cosTheta * 0.001;
        return { thetaRad, cosTheta, hMm, laplacePa, fSurfaceMn };
      }

      syncVisuals() {
        const p = sceneParams.capillary;
        const { cosTheta, hMm } = this.getCapillaryMetrics();

        const rVis = 0.26 + p.tubeRadiusMm * 0.22;
        this.capillaryTube.scale.set(rVis / 0.45, 1, rVis / 0.45);

        const baseLevelY = 1.65;
        const hVis = Math.max(-0.85, Math.min(3.5, hMm * 0.11));
        const topY = baseLevelY + hVis;
        const colBottom = 0.65;
        const colHeight = Math.max(0.18, topY - colBottom);

        const isNonWetting = cosTheta < 0;
        this.basinLiquid.material.color.setHex(isNonWetting ? 0x64748b : 0x0284c7);
        if (this.basinSurfaceDisk) {
          this.basinSurfaceDisk.material.color.setHex(isNonWetting ? 0x94a3b8 : 0x38bdf8);
        }
        this.columnMesh.material.color.setHex(isNonWetting ? 0x475569 : 0x0369a1);
        this.meniscusMesh.material.color.setHex(isNonWetting ? 0x94a3b8 : 0x38bdf8);

        this.columnMesh.scale.set(rVis / 0.4, colHeight, rVis / 0.4);
        this.columnMesh.position.set(0, colBottom + colHeight * 0.5, 0);

        this.meniscusMesh.position.set(0, topY, 0);
        this.meniscusMesh.rotation.x = isNonWetting ? 0 : Math.PI;
        this.meniscusMesh.scale.set(rVis / 0.4, Math.max(0.15, Math.abs(cosTheta) * 0.45), rVis / 0.4);

        this.molecules.forEach((m, idx) => {
          m.mesh.visible = uiState.showParticles;
          const jitter = Math.sin(uiState.simTime * 5 + idx) * 0.03;
          m.mesh.position.set(
            Math.cos(m.angle) * (rVis + 0.02),
            topY + jitter,
            Math.sin(m.angle) * (rVis + 0.02)
          );
        });

        this.updateUI();
      }

      update(dt) {
        this.syncVisuals();
        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
      }

      updateUI() {
        const { cosTheta, hMm, laplacePa, fSurfaceMn } = this.getCapillaryMetrics();
        const baseLevelY = 1.65;
        const topY = baseLevelY + Math.max(-0.85, Math.min(3.5, hMm * 0.11));

        this.arrowSigma.update(
          new THREE.Vector3(0, topY, 0),
          new THREE.Vector3(0, cosTheta >= 0 ? 1 : -1, 0),
          Math.min(2.1, 0.55 + Math.abs(hMm) * 0.05),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowWeight.update(
          new THREE.Vector3(0, (baseLevelY + topY) * 0.5, 0.35),
          new THREE.Vector3(0, -1, 0),
          Math.min(2.0, 0.5 + Math.abs(hMm) * 0.045),
          uiState.showVectors,
          uiState.showLabels
        );

        const wSurf = Math.abs(fSurfaceMn) * 20;
        const uGrav = Math.abs(hMm) * 0.6;

        updateEnergyUI(wSurf, uGrav, Math.abs(laplacePa) * 0.02, Math.max(1, wSurf + uGrav + 5), [
          { label: 'Висота Жюрена h', val: `${hMm.toFixed(1)} мм` },
          { label: 'Лапласівський тиск ΔP', val: `${laplacePa.toFixed(0)} Па` },
          { label: 'Сила натягу F_σ', val: `${fSurfaceMn.toFixed(2)} мН` },
          { label: 'Тип меніска', val: cosTheta >= 0 ? 'Увігнутий (змочування)' : 'Опуклий (незмочування)' }
        ]);
      }

      dispose() {
        this.arrowSigma.dispose();
        this.arrowWeight.dispose();
      }
    }

    // ============================================================================
    // 41. МОДУЛЬ § 41: БРОУНІВСЬКИЙ РУХ І ФОРМУЛА ЕЙНШТЕЙНА–СМОЛУХОВСЬКОГО
    // ============================================================================
    class BrownianMotionSimulation {
      constructor() {
        this.bathMolecules = [];
        this.trailPts = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const stage = new THREE.Mesh(
          new THREE.CylinderGeometry(4.8, 5.1, 0.36, 42),
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.65 })
        );
        stage.position.set(0, 0.18, 0);
        stage.receiveShadow = true;
        worldGroup.add(stage);

        // Кільце кювети мікроскопа з координатною сіткою окуляр-мікрометра
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(4.3, 0.18, 16, 64),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75, roughness: 0.28 })
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.set(0, 2.2, 0);
        worldGroup.add(rim);

        // Концентричні кола середньоквадратичного зміщення √⟨r²⟩ = √(6Dt)
        this.rmsRing = new THREE.Mesh(
          new THREE.RingGeometry(0.95, 1.03, 48),
          new THREE.MeshBasicMaterial({ color: 0x1d4ed8, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
        );
        this.rmsRing.rotation.x = -Math.PI / 2;
        this.rmsRing.position.set(0, 2.15, 0);
        worldGroup.add(this.rmsRing);

        // Зависла броунівська мікрочастинка (пилкове зерно / колоїдна кулька)
        this.grainMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 28, 28),
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.2 })
        );
        this.grainMesh.castShadow = true;
        this.grainMesh.position.set(0, 2.2, 0);
        worldGroup.add(this.grainMesh);

        // Ламана траєкторія випадкового блукання Перрена
        const maxPts = 180;
        const initPts = [];
        for (let i = 0; i < maxPts; i++) initPts.push(new THREE.Vector3(0, 2.2, 0));
        this.trailLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(initPts),
          new THREE.LineBasicMaterial({ color: 0xdc2626 })
        );
        worldGroup.add(this.trailLine);

        // Теплові молекули розчинника, що хаотично бомбардують броунівську частинку
        const molGeo = new THREE.SphereGeometry(0.085, 10, 10);
        const molMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0369a1, emissiveIntensity: 0.4 });
        for (let i = 0; i < 48; i++) {
          const m = new THREE.Mesh(molGeo, molMat);
          worldGroup.add(m);
          this.bathMolecules.push({
            mesh: m,
            angle: (i / 48) * Math.PI * 2,
            rad: 0.9 + (i % 7) * 0.45,
            speed: 1.5 + (i % 5) * 0.4
          });
        }

        this.arrowDisp = new SmartVectorArrow('r(t) (зміщення частинки)', 0x1d4ed8, '#1d4ed8');
        this.arrowKick = new SmartVectorArrow('v_тепл (удари молекул)', 0xd97706, '#d97706');
      }

      reset() {
        this.phaseTriggered = false;
        this.grainPos = new THREE.Vector3(0, 2.2, 0);
        this.kickDir = new THREE.Vector3(1, 0, 0);
        this.stepTimer = 0;
        this.stepCount = 1;
        this.trailPts = [new THREE.Vector3(0, 2.2, 0)];
        this.syncVisuals();
      }

      getDiffMetrics() {
        const p = sceneParams.brownian;
        const dUm2S = (1.38 * p.tempK) / (6 * Math.PI * p.viscosityEta * p.grainRadiusUm * 100);
        const rmsTheory = Math.sqrt(6 * dUm2S * Math.max(0.1, uiState.simTime));
        return { dUm2S, rmsTheory };
      }

      syncVisuals() {
        const p = sceneParams.brownian;
        const { rmsTheory } = this.getDiffMetrics();

        const gScale = 0.65 + p.grainRadiusUm * 0.35;
        this.grainMesh.scale.setScalar(gScale);
        this.grainMesh.position.copy(this.grainPos);

        const rRing = Math.min(3.8, Math.max(0.35, rmsTheory * 0.85));
        this.rmsRing.visible = uiState.showTrails;
        this.rmsRing.scale.set(rRing, rRing, 1);

        this.trailLine.visible = uiState.showTrails;
        const posAttr = this.trailLine.geometry.attributes.position;
        for (let i = 0; i < 180; i++) {
          const pt = this.trailPts[Math.min(i, this.trailPts.length - 1)];
          posAttr.setXYZ(i, pt.x, pt.y, pt.z);
        }
        posAttr.needsUpdate = true;

        const thFactor = Math.sqrt(p.tempK / 300);
        this.bathMolecules.forEach((m, idx) => {
          m.mesh.visible = uiState.showParticles;
          const a = m.angle + uiState.simTime * m.speed * thFactor * (idx % 2 === 0 ? 1 : -1);
          const r = m.rad + Math.sin(uiState.simTime * 4 + idx) * 0.25;
          m.mesh.position.set(
            Math.cos(a) * r,
            2.2 + Math.cos(uiState.simTime * 3 + idx) * 0.18,
            Math.sin(a) * r
          );
        });

        this.updateUI();
      }

      update(dt) {
        const { dUm2S } = this.getDiffMetrics();
        this.stepTimer += dt;
        if (this.stepTimer >= 0.08) {
          this.stepTimer = 0;
          const stepLen = Math.sqrt(2 * dUm2S * 0.08) * 1.15;
          const randAngle = Math.sin(uiState.simTime * 43.7 + this.trailPts.length * 1.9) * Math.PI * 2;
          this.kickDir.set(Math.cos(randAngle), 0, Math.sin(randAngle)).normalize();
          this.grainPos.x += this.kickDir.x * stepLen;
          this.grainPos.z += this.kickDir.z * stepLen;
          const dist = Math.hypot(this.grainPos.x, this.grainPos.z);
          if (dist > 3.5) {
            this.grainPos.x *= 3.5 / dist;
            this.grainPos.z *= 3.5 / dist;
          }
          if (this.trailPts.length < 180) {
            this.trailPts.push(this.grainPos.clone());
          } else {
            this.trailPts.shift();
            this.trailPts.push(this.grainPos.clone());
          }
          this.stepCount = (this.stepCount || 1) + 1;
        }

        this.syncVisuals();
        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
      }

      updateUI() {
        const p = sceneParams.brownian;
        const { dUm2S, rmsTheory } = this.getDiffMetrics();
        const curR = Math.hypot(this.grainPos.x, this.grainPos.z);

        this.arrowDisp.update(
          new THREE.Vector3(0, 2.25, 0),
          curR > 0.05 ? new THREE.Vector3(this.grainPos.x, 0, this.grainPos.z).normalize() : new THREE.Vector3(1, 0, 0),
          Math.max(0.25, curR),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowKick.update(
          this.grainPos.clone().add(new THREE.Vector3(0, 0.45, 0)),
          this.kickDir,
          0.95 + (p.tempK - 250) * 0.003,
          uiState.showVectors,
          uiState.showLabels
        );

        const eTh = (p.tempK / 300) * 15;
        const dScale = dUm2S * 40;
        const stokesDiss = p.viscosityEta * p.grainRadiusUm * 6;

        updateEnergyUI(eTh, dScale, stokesDiss, Math.max(1, eTh + dScale + stokesDiss), [
          { label: 'Коефіцієнт дифузії D', val: `${dUm2S.toFixed(2)} мкм²/с` },
          { label: 'Теоретичне √⟨r²⟩', val: `${rmsTheory.toFixed(2)} мкм` },
          { label: 'Поточне зміщення |r(t)|', val: `${curR.toFixed(2)} мкм` },
          { label: 'Кількість зламів траєкторії', val: `${this.stepCount || this.trailPts.length}` }
        ]);
      }

      dispose() {
        this.arrowDisp.dispose();
        this.arrowKick.dispose();
      }
    }

    // ============================================================================
    // 42. МОДУЛЬ § 42: ІНТЕРФЕРОМЕТР МАЙКЕЛЬСОНА — ПРЕЦИЗІЙНА ІНТЕРФЕРЕНЦІЯ
    // ============================================================================
    class MichelsonInterferometerSimulation {
      constructor() {
        this.fringeRings = [];
        this.waveCrests = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const opticalTable = new THREE.Mesh(
          new THREE.BoxGeometry(11.5, 0.38, 11.5),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.55, roughness: 0.4 })
        );
        opticalTable.position.set(0, 0.19, 0);
        opticalTable.receiveShadow = true;
        worldGroup.add(opticalTable);

        // Лазерне джерело зліва (-4.6, 1.6, 0)
        const laserBody = new THREE.Mesh(
          new THREE.BoxGeometry(1.7, 0.75, 0.85),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 })
        );
        laserBody.position.set(-4.5, 1.6, 0);
        worldGroup.add(laserBody);

        // Світлоподілювач BS у центрі (0, 1.6, 0) під кутом 45°
        const bsGlass = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 1.3, 0.08),
          new THREE.MeshPhysicalMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.5, roughness: 0.05 })
        );
        bsGlass.position.set(0, 1.6, 0);
        bsGlass.rotation.y = Math.PI / 4;
        worldGroup.add(bsGlass);

        // Нерухоме дзеркало M₂ у плечі +X (4.2, 1.6, 0)
        const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.05 });
        this.mirrorM2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 1.5), mirrorMat);
        this.mirrorM2.position.set(4.2, 1.6, 0);
        worldGroup.add(this.mirrorM2);

        // Рухоме дзеркало M₁ з мікрометричним гвинтом у плечі -Z (0, 1.6, -4.2)
        this.mirrorM1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 0.18), mirrorMat);
        this.mirrorM1.position.set(0, 1.6, -4.2);
        worldGroup.add(this.mirrorM1);

        // Екран спостереження інтерференційних кілець у плечі +Z (0, 1.9, 4.3)
        const screenBoard = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 2.8, 0.16),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 })
        );
        screenBoard.position.set(0, 1.9, 4.35);
        worldGroup.add(screenBoard);

        // Концентричні інтерференційні кільця рівного нахилу на екрані
        for (let r = 0; r < 6; r++) {
          const ringGeo = r === 0
            ? new THREE.CircleGeometry(0.22, 32)
            : new THREE.RingGeometry(r * 0.22, r * 0.22 + 0.16, 40);
          const ringMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(0, 1.9, 4.25);
          worldGroup.add(ring);
          this.fringeRings.push({ mesh: ring, order: r });
        }

        // Лазерні промені в плечах інтерферометра
        this.beamMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.72 });
        const bLaser = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.7, 12), this.beamMat);
        bLaser.rotation.z = Math.PI / 2;
        bLaser.position.set(-1.85, 1.6, 0);
        const bArm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 4.2, 12), this.beamMat);
        bArm2.rotation.z = Math.PI / 2;
        bArm2.position.set(2.1, 1.6, 0);
        const bArm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 4.2, 12), this.beamMat);
        bArm1.rotation.x = Math.PI / 2;
        bArm1.position.set(0, 1.6, -2.1);
        const bDet = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.2, 12), this.beamMat);
        bDet.rotation.x = Math.PI / 2;
        bDet.position.set(0, 1.6, 2.1);
        worldGroup.add(bLaser, bArm1, bArm2, bDet);
        this.beams = [bLaser, bArm1, bArm2, bDet];

        // Рухомі гребені світлових хвиль уздовж обох плечей
        const crestGeo = new THREE.TorusGeometry(0.18, 0.025, 8, 20);
        for (let i = 0; i < 16; i++) {
          const c1 = new THREE.Mesh(crestGeo, this.beamMat);
          const c2 = new THREE.Mesh(crestGeo, this.beamMat);
          c2.rotation.y = Math.PI / 2;
          worldGroup.add(c1, c2);
          this.waveCrests.push({ c1, c2, phase: i / 16 });
        }

        this.arrowArm1 = new SmartVectorArrow('Промінь 1 (плече L₁)', 0x16a34a, '#16a34a');
        this.arrowArm2 = new SmartVectorArrow('Промінь 2 (плече L₂)', 0x0284c7, '#0284c7');
        this.arrowDet = new SmartVectorArrow('k_інт (до детектора)', 0xd97706, '#d97706');
      }

      wavelengthToHex(nm) {
        if (nm < 470) return 0x6366f1;
        if (nm < 510) return 0x06b6d4;
        if (nm < 565) return 0x22c55e;
        if (nm < 605) return 0xeab308;
        return 0xef4444;
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.michelson;
        const colHex = this.wavelengthToHex(p.wavelengthNm);
        this.beamMat.color.setHex(colHex);
        this.beams.forEach(b => { b.visible = uiState.showTrails; });

        const shiftVisual = (p.mirrorShiftNm / 700) * 0.45;
        const arm1Len = 4.2 + shiftVisual;
        this.mirrorM1.position.set(0, 1.6, -arm1Len);
        if (this.beams && this.beams[1]) {
          this.beams[1].scale.set(1, arm1Len / 4.2, 1);
          this.beams[1].position.set(0, 1.6, -arm1Len * 0.5);
        }

        const deltaPhase = (4 * Math.PI * p.mirrorShiftNm) / p.wavelengthNm;
        this.fringeRings.forEach(r => {
          r.mesh.material.color.setHex(colHex);
          const ringPhase = deltaPhase - r.order * Math.PI * 0.85;
          const intensity = Math.pow(Math.cos(ringPhase * 0.5), 2);
          r.mesh.material.opacity = 0.08 + 0.88 * intensity;
        });

        this.waveCrests.forEach(wc => {
          wc.c1.visible = uiState.showParticles;
          wc.c2.visible = uiState.showParticles;
          const u = (wc.phase + uiState.simTime * 0.8) % 1.0;
          wc.c1.position.set(0, 1.6, -0.3 - u * 3.7);
          wc.c2.position.set(0.3 + u * 3.7, 1.6, 0);
        });

        this.updateUI();
      }

      update(dt) {
        this.syncVisuals();
        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
      }

      updateUI() {
        const p = sceneParams.michelson;
        const deltaNm = 2 * p.mirrorShiftNm;
        const mShift = deltaNm / p.wavelengthNm;
        const iRel = Math.pow(Math.cos((Math.PI * deltaNm) / p.wavelengthNm), 2);
        const iCenterMw = p.beamPowerMw * iRel;

        this.arrowArm1.update(
          new THREE.Vector3(0, 1.95, -1.8),
          new THREE.Vector3(0, 0, -1),
          1.6,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowArm2.update(
          new THREE.Vector3(1.8, 1.95, 0),
          new THREE.Vector3(1, 0, 0),
          1.6,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowDet.update(
          new THREE.Vector3(0, 1.95, 1.4),
          new THREE.Vector3(0, 0, 1),
          0.65 + 1.4 * iRel,
          uiState.showVectors,
          uiState.showLabels
        );

        updateEnergyUI(iCenterMw, p.beamPowerMw * 0.5, p.beamPowerMw * (1 - iRel), Math.max(1, p.beamPowerMw * 1.5), [
          { label: 'Оптична різниця ходу 2Δd', val: `${deltaNm.toFixed(0)} нм` },
          { label: 'Число зміщених смуг Δm', val: `${mShift.toFixed(2)}` },
          { label: 'Інтенсивність у центрі I', val: `${iCenterMw.toFixed(2)} мВт` },
          { label: 'Стан центру картини', val: iRel > 0.5 ? 'Інтерференційний максимум' : 'Інтерференційний мінімум' }
        ]);
      }

      dispose() {
        this.arrowArm1.dispose();
        this.arrowArm2.dispose();
        this.arrowDet.dispose();
      }
    }

    // ============================================================================
    // 43. МОДУЛЬ § 43: ЕФЕКТ КОМПТОНА — РОЗСІЯННЯ РЕНТГЕНІВСЬКИХ ФОТОНІВ
    // ============================================================================
    class ComptonScatteringSimulation {
      constructor() {
        this.wavePackets = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(12.5, 0.35, 6.8),
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.65 })
        );
        base.position.set(0, 0.175, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Графітова мішень у центрі (0, 2.3, 0) і гоніометричне кільце кутів розсіяння θ
        const gonioRing = new THREE.Mesh(
          new THREE.RingGeometry(3.6, 3.85, 64),
          new THREE.MeshBasicMaterial({ color: 0x64748b, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
        );
        gonioRing.rotation.x = -Math.PI / 2;
        gonioRing.position.set(0, 0.38, 0);
        worldGroup.add(gonioRing);

        const targetPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.16, 2.1, 18),
          new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 })
        );
        targetPost.position.set(0, 1.2, 0);
        worldGroup.add(targetPost);

        // Рентгенівська трубка зліва (-5.2, 2.3, 0)
        const emitter = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.38, 1.6, 20),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.25 })
        );
        emitter.rotation.z = Math.PI / 2;
        emitter.position.set(-5.2, 2.3, 0);
        worldGroup.add(emitter);

        // Квант рентгенівського випромінювання та електрон віддачі
        this.photonSphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 20, 20),
          new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x6d28d9, emissiveIntensity: 0.8 })
        );
        this.electronSphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 24, 24),
          new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0369a1, emissiveIntensity: 0.45 })
        );
        worldGroup.add(this.photonSphere, this.electronSphere);

        // Напрямні промені: падаючий, розсіяний фотон (θ) та електрон віддачі (φ)
        this.incLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4.5, 2.3, 0), new THREE.Vector3(0, 2.3, 0)]),
          new THREE.LineBasicMaterial({ color: 0x8b5cf6 })
        );
        this.scatLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.3, 0), new THREE.Vector3(3.8, 2.3, 0)]),
          new THREE.LineBasicMaterial({ color: 0xd97706 })
        );
        this.recLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.3, 0), new THREE.Vector3(3.2, 2.3, 0)]),
          new THREE.LineBasicMaterial({ color: 0x0284c7 })
        );
        worldGroup.add(this.incLine, this.scatLine, this.recLine);

        this.arrowP0 = new SmartVectorArrow('p_γ (падаючий фотон)', 0x7c3aed, '#7c3aed');
        this.arrowP1 = new SmartVectorArrow('p_γ′ (розсіяний фотон)', 0xd97706, '#d97706');
        this.arrowPe = new SmartVectorArrow('p_e (віддача електрона)', 0x0284c7, '#0284c7');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      getComptonMetrics() {
        const p = sceneParams.compton;
        const lambdaC = 2.426;
        const thetaRad = (p.scatterAngleDeg * Math.PI) / 180;
        const dLambda = lambdaC * (1 - Math.cos(thetaRad));
        const lambdaPrime = p.lambda0Pm + dLambda;
        const e0Kev = 1240 / p.lambda0Pm;
        const ePrimeKev = 1240 / lambdaPrime;
        const kElectronKev = Math.max(0, e0Kev - ePrimeKev);
        const phiRad = Math.atan2(Math.sin(thetaRad), (lambdaPrime / p.lambda0Pm) - Math.cos(thetaRad));
        return { thetaRad, dLambda, lambdaPrime, e0Kev, ePrimeKev, kElectronKev, phiRad };
      }

      syncVisuals() {
        const p = sceneParams.compton;
        const { thetaRad, phiRad } = this.getComptonMetrics();

        const scatDir = new THREE.Vector3(Math.cos(thetaRad), 0, -Math.sin(thetaRad)).normalize();
        const recDir = new THREE.Vector3(Math.cos(phiRad), 0, Math.sin(phiRad)).normalize();

        this.incLine.visible = uiState.showTrails;
        this.scatLine.visible = uiState.showTrails;
        this.recLine.visible = uiState.showTrails;

        this.scatLine.geometry.setFromPoints([
          new THREE.Vector3(0, 2.3, 0),
          scatDir.clone().multiplyScalar(4.0).add(new THREE.Vector3(0, 2.3, 0))
        ]);
        this.recLine.geometry.setFromPoints([
          new THREE.Vector3(0, 2.3, 0),
          recDir.clone().multiplyScalar(3.4).add(new THREE.Vector3(0, 2.3, 0))
        ]);

        const cycle = (uiState.simTime * p.beamRate * 0.75) % 1.0;
        this.photonSphere.visible = uiState.showParticles;
        this.electronSphere.visible = true;

        if (cycle < 0.45) {
          // Фотон летить до нерухомого електрона в центрі
          const u = cycle / 0.45;
          this.photonSphere.position.set(-4.4 * (1 - u), 2.3 + Math.sin(u * Math.PI * 10) * 0.14, 0);
          this.photonSphere.material.color.setHex(0x8b5cf6);
          this.electronSphere.position.set(0, 2.3, 0);
        } else {
          // Після зіткнення: розсіяний фотон з більшою λ′ та електрон віддачі
          const u = (cycle - 0.45) / 0.55;
          this.photonSphere.position.copy(scatDir.clone().multiplyScalar(u * 4.0)).add(new THREE.Vector3(0, 2.3 + Math.sin(u * Math.PI * 6) * 0.18, 0));
          this.photonSphere.material.color.setHex(0xf59e0b);
          this.electronSphere.position.copy(recDir.clone().multiplyScalar(u * 3.2)).add(new THREE.Vector3(0, 2.3, 0));
        }

        this.updateUI();
      }

      update(dt) {
        this.syncVisuals();
        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
      }

      updateUI() {
        const { thetaRad, dLambda, lambdaPrime, e0Kev, ePrimeKev, kElectronKev, phiRad } = this.getComptonMetrics();
        const scatDir = new THREE.Vector3(Math.cos(thetaRad), 0, -Math.sin(thetaRad)).normalize();
        const recDir = new THREE.Vector3(Math.cos(phiRad), 0, Math.sin(phiRad)).normalize();

        this.arrowP0.update(
          new THREE.Vector3(-2.6, 2.6, 0),
          new THREE.Vector3(1, 0, 0),
          1.7,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowP1.update(
          new THREE.Vector3(0, 2.6, 0),
          scatDir,
          Math.max(0.6, 1.7 * (ePrimeKev / e0Kev)),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowPe.update(
          new THREE.Vector3(0, 2.1, 0),
          recDir,
          Math.max(0.45, 2.2 * (kElectronKev / e0Kev)),
          uiState.showVectors,
          uiState.showLabels
        );

        updateEnergyUI(ePrimeKev, kElectronKev, 0, Math.max(1, e0Kev), [
          { label: 'Зсув Комптона Δλ', val: `${dLambda.toFixed(2)} пм` },
          { label: 'Розсіяна довжина λ′', val: `${lambdaPrime.toFixed(2)} пм` },
          { label: 'Енергія кванта E_γ′', val: `${ePrimeKev.toFixed(1)} кеВ` },
          { label: 'Енергія віддачі K_e', val: `${kElectronKev.toFixed(1)} кеВ (φ=${((phiRad * 180) / Math.PI).toFixed(0)}°)` }
        ]);
      }

      dispose() {
        this.arrowP0.dispose();
        this.arrowP1.dispose();
        this.arrowPe.dispose();
      }
    }

    // ============================================================================
    // 44. МОДУЛЬ § 44: МОДЕЛЬ АТОМА БОРА, ХВИЛІ ДЕ БРОЙЛЯ ТА СПЕКТРАЛЬНІ СЕРІЇ
    // ============================================================================
    class BohrAtomSimulation {
      constructor() {
        this.orbitRings = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(5.2, 5.5, 0.35, 48),
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.65 })
        );
        base.position.set(0, 0.175, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Ядро атома водню (протон +e) у центрі (0, 2.3, 0)
        const nucleus = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 24, 24),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x991b1b, emissiveIntensity: 0.55 })
        );
        nucleus.position.set(0, 2.3, 0);
        worldGroup.add(nucleus);

        // 4 дозволені стаціонарні борівські орбіти (n = 1, 2, 3, 4)
        const radii = [1.0, 1.9, 2.95, 4.1];
        radii.forEach(r => {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(r - 0.025, r + 0.025, 64),
            new THREE.MeshBasicMaterial({ color: 0x64748b, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(0, 2.3, 0);
          worldGroup.add(ring);
          this.orbitRings.push({ mesh: ring, r });
        });

        // Стояча хвиля де Бройля (2πr_n = n λ_дБ) уздовж активної орбіти
        const wavePts = [];
        for (let i = 0; i <= 160; i++) wavePts.push(new THREE.Vector3(0, 2.3, 0));
        this.deBroglieLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(wavePts),
          new THREE.LineBasicMaterial({ color: 0x0284c7 })
        );
        worldGroup.add(this.deBroglieLine);

        // Електрон на орбіті та випромінений фотон переходу hν
        this.electronMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.19, 20, 20),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.7 })
        );
        this.photonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.85 })
        );
        worldGroup.add(this.electronMesh, this.photonMesh);

        this.arrowVel = new SmartVectorArrow('v_n (орбітальна e⁻)', 0x16a34a, '#16a34a');
        this.arrowCoulomb = new SmartVectorArrow('F_К (до ядра)', 0xdc2626, '#dc2626');
        this.arrowPhoton = new SmartVectorArrow('hν (випромінений фотон)', 0xd97706, '#d97706');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      getBohrMetrics() {
        const p = sceneParams.bohr;
        const ni = Math.max(p.levelFinal + 1, p.levelInit);
        const nf = p.levelFinal;
        const eInit = -13.6 / (ni * ni);
        const eFinal = -13.6 / (nf * nf);
        const dE = eInit - eFinal;
        const lambdaNm = 1240 / Math.max(0.1, dE);
        return { ni, nf, eInit, eFinal, dE, lambdaNm };
      }

      syncVisuals() {
        const p = sceneParams.bohr;
        const { ni, nf, lambdaNm } = this.getBohrMetrics();
        const radii = [1.0, 1.9, 2.95, 4.1];

        // Періодичний квантовий перехід n_i → n_f з випромінюванням фотона
        const cycle = (uiState.simTime * 0.55) % 1.0;
        const inUpper = cycle < 0.48;
        const nActive = inUpper ? ni : nf;
        const rActive = radii[nActive - 1];

        this.orbitRings.forEach((o, idx) => {
          o.mesh.visible = uiState.showTrails;
          o.mesh.material.color.setHex(idx + 1 === nActive ? 0x1e3a5f : 0x94a3b8);
          o.mesh.material.opacity = idx + 1 === nActive ? 0.85 : 0.35;
        });

        // Побудова замкненої стоячої хвилі де Бройля з рівно nActive довжинами хвиль по колу
        this.deBroglieLine.visible = uiState.showTrails;
        const pos = this.deBroglieLine.geometry.attributes.position;
        for (let i = 0; i <= 160; i++) {
          const a = (i / 160) * Math.PI * 2;
          const rMod = rActive + p.deBroglieAmp * Math.sin(nActive * a) * Math.cos(uiState.simTime * 8);
          pos.setXYZ(i, Math.cos(a) * rMod, 2.3, Math.sin(a) * rMod);
        }
        pos.needsUpdate = true;

        const eAngle = uiState.simTime * (3.2 / nActive);
        this.electronMesh.position.set(Math.cos(eAngle) * rActive, 2.3, Math.sin(eAngle) * rActive);

        // Колір фотона відповідає спектральній лінії (Лайман — УФ/фіолетовий, Бальмер — видимий, Пашен — ІЧ/темно-червоний)
        const pCol = lambdaNm < 380 ? 0x8b5cf6 : (lambdaNm < 460 ? 0x6366f1 : (lambdaNm < 520 ? 0x06b6d4 : (lambdaNm < 700 ? 0xef4444 : 0x991b1b)));
        this.photonMesh.material.color.setHex(pCol);
        this.photonMesh.material.emissive.setHex(pCol);
        this.photonMesh.visible = uiState.showParticles && !inUpper;

        if (!inUpper) {
          const uPhot = (cycle - 0.48) / 0.52;
          const rPhot = rActive + uPhot * 3.8;
          this.photonMesh.position.set(rPhot, 2.3 + Math.sin(uPhot * Math.PI * 10) * 0.2, 0);
        }

        this.updateUI();
      }

      update(dt) {
        this.syncVisuals();
        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
      }

      updateUI() {
        const { ni, nf, eInit, eFinal, dE, lambdaNm } = this.getBohrMetrics();
        const ePos = this.electronMesh.position;
        const radVec = new THREE.Vector3(ePos.x, 0, ePos.z).normalize();
        const tanVec = new THREE.Vector3(-radVec.z, 0, radVec.x);

        this.arrowVel.update(
          ePos,
          tanVec,
          1.45,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowCoulomb.update(
          ePos,
          radVec.clone().negate(),
          1.15,
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowPhoton.update(
          this.photonMesh.position.clone(),
          new THREE.Vector3(1, 0, 0),
          this.photonMesh.visible ? 1.35 : 0,
          uiState.showVectors && this.photonMesh.visible,
          uiState.showLabels && this.photonMesh.visible
        );

        const cycle = (uiState.simTime * 0.55) % 1.0;
        const nActive = cycle < 0.48 ? ni : nf;
        const eActive = -13.6 / (nActive * nActive);
        const seriesName = nf === 1 ? 'Лаймана (УФ)' : (nf === 2 ? 'Бальмера (видима)' : 'Пашена (ІЧ)');

        updateEnergyUI(Math.abs(eActive), Math.abs(eFinal), dE, 14.0, [
          { label: 'Перехід n_i → n_f', val: `${ni} → ${nf} (${seriesName})` },
          { label: 'Енергія фотона hν', val: `${dE.toFixed(2)} еВ` },
          { label: 'Довжина хвилі лінії λ', val: `${lambdaNm.toFixed(0)} нм` },
          { label: 'Число хвиль де Бройля', val: `${nActive} λ_дБ на колі` }
        ]);
      }

      dispose() {
        this.arrowVel.dispose();
        this.arrowCoulomb.dispose();
        this.arrowPhoton.dispose();
      }
    }

    // ============================================================================
    // 45. МОДУЛЬ § 45: ЗАКОН БІО–САВАРА–ЛАПЛАСА ТА КОТУШКИ ГЕЛЬМГОЛЬЦА
    // ============================================================================
    class HelmholtzCoilSimulation {
      constructor() {
        this.fieldLines = [];
        this.carriers = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(12.0, 0.36, 5.4),
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.65 })
        );
        base.position.set(0, 0.18, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Дві співвісні мідні котушки радіуса R уздовж осі X
        const copperMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.78, roughness: 0.25 });
        this.coil1 = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.16, 20, 48), copperMat);
        this.coil2 = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.16, 20, 48), copperMat);
        this.coil1.rotation.y = Math.PI / 2;
        this.coil2.rotation.y = Math.PI / 2;
        this.coil1.castShadow = true;
        this.coil2.castShadow = true;
        worldGroup.add(this.coil1, this.coil2);

        // Силові лінії магнітного поля B(x, y) та крива осьового профілю B_x(x)
        const yOffsets = [-0.9, -0.45, 0, 0.45, 0.9];
        yOffsets.forEach(y0 => {
          const pts = [];
          for (let i = 0; i <= 50; i++) pts.push(new THREE.Vector3(-4.5 + (i / 50) * 9.0, 2.6 + y0, 0));
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.65 })
          );
          worldGroup.add(line);
          this.fieldLines.push({ line, y0 });
        });

        // Графік профілю B(x) над котушками, що показує плоске плато Гельмгольца при d = R
        const profPts = [];
        for (let i = 0; i <= 60; i++) profPts.push(new THREE.Vector3(-4.5 + (i / 60) * 9.0, 1.0, 1.8));
        this.profileCurve = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(profPts),
          new THREE.LineBasicMaterial({ color: 0x16a34a })
        );
        worldGroup.add(this.profileCurve);

        // Носії струму в обох котушках
        const cGeo = new THREE.SphereGeometry(0.085, 10, 10);
        const cMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        for (let i = 0; i < 20; i++) {
          const m1 = new THREE.Mesh(cGeo, cMat);
          const m2 = new THREE.Mesh(cGeo, cMat);
          worldGroup.add(m1, m2);
          this.carriers.push({ m1, m2, phase: i / 20 });
        }

        this.arrowB0 = new SmartVectorArrow('B₀ (осьове поле)', 0x1d4ed8, '#1d4ed8');
        this.arrowI1 = new SmartVectorArrow('I (струм котушок)', 0xd97706, '#d97706');
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      calcBAtX(xDm) {
        const p = sceneParams.biot;
        const rM = p.coilRadius * 0.1;
        const dM = p.coilSepRatio * rM;
        const xM = xDm * 0.1;
        const mu0 = 1.2566;
        const b1 = (mu0 * p.turnsN * p.currentI * rM * rM) / (2 * Math.pow(rM * rM + Math.pow(xM + dM * 0.5, 2), 1.5));
        const b2 = (mu0 * p.turnsN * p.currentI * rM * rM) / (2 * Math.pow(rM * rM + Math.pow(xM - dM * 0.5, 2), 1.5));
        return b1 + b2;
      }

      syncVisuals() {
        const p = sceneParams.biot;
        const rVis = p.coilRadius;
        const halfD = 0.5 * p.coilSepRatio * rVis;

        this.coil1.scale.set(rVis / 1.8, rVis / 1.8, 1);
        this.coil2.scale.set(rVis / 1.8, rVis / 1.8, 1);
        this.coil1.position.set(-halfD, 2.6, 0);
        this.coil2.position.set(halfD, 2.6, 0);

        const bCenter = this.calcBAtX(0);
        this.fieldLines.forEach(fl => {
          fl.line.visible = uiState.showTrails;
          const pos = fl.line.geometry.attributes.position;
          for (let i = 0; i <= 50; i++) {
            const x = -4.5 + (i / 50) * 9.0;
            const bLocal = this.calcBAtX(x);
            const spread = Math.sqrt(Math.max(0.25, bCenter / Math.max(0.05, bLocal)));
            pos.setXYZ(i, x, 2.6 + fl.y0 * Math.min(1.6, spread), 0);
          }
          pos.needsUpdate = true;
        });

        this.profileCurve.visible = uiState.showTrails;
        const pPos = this.profileCurve.geometry.attributes.position;
        for (let i = 0; i <= 60; i++) {
          const x = -4.5 + (i / 60) * 9.0;
          const bVal = this.calcBAtX(x);
          pPos.setXYZ(i, x, 0.55 + Math.min(3.2, bVal * 0.14), 1.8);
        }
        pPos.needsUpdate = true;

        this.carriers.forEach(c => {
          c.m1.visible = uiState.showParticles;
          c.m2.visible = uiState.showParticles;
          const a = (c.phase + uiState.simTime * p.currentI * 0.08) * Math.PI * 2;
          c.m1.position.set(-halfD, 2.6 + Math.cos(a) * rVis, Math.sin(a) * rVis);
          c.m2.position.set(halfD, 2.6 + Math.cos(a) * rVis, Math.sin(a) * rVis);
        });

        this.updateUI();
      }

      update(dt) {
        this.syncVisuals();
        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
      }

      updateUI() {
        const p = sceneParams.biot;
        const bCenter = this.calcBAtX(0);
        const bMidCoil = this.calcBAtX(0.5 * p.coilSepRatio * p.coilRadius);
        const inhomogPct = (Math.abs(bCenter - this.calcBAtX(0.25 * p.coilRadius)) / Math.max(0.01, bCenter)) * 100;

        this.arrowB0.update(
          new THREE.Vector3(-0.9, 2.6, 0),
          new THREE.Vector3(1, 0, 0),
          Math.min(2.3, 0.6 + bCenter * 0.12),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowI1.update(
          new THREE.Vector3(-0.5 * p.coilSepRatio * p.coilRadius, 2.6 + p.coilRadius, 0),
          new THREE.Vector3(0, 0, 1),
          Math.min(1.8, 0.5 + p.currentI * 0.12),
          uiState.showVectors,
          uiState.showLabels
        );

        const wMag = bCenter * p.currentI * 0.8;

        updateEnergyUI(wMag, bCenter * 2.5, inhomogPct * 0.3, Math.max(1, wMag + bCenter * 2.5 + 5), [
          { label: 'Індукція в центрі B(0)', val: `${bCenter.toFixed(2)} мТл` },
          { label: 'Індукція в площині витка', val: `${bMidCoil.toFixed(2)} мТл` },
          { label: 'Неоднорідність у центрі', val: `${inhomogPct.toFixed(1)} %` },
          { label: 'Конфігурація d/R', val: Math.abs(p.coilSepRatio - 1.0) < 0.05 ? '1.00 (Плато Гельмгольца)' : `${p.coilSepRatio.toFixed(2)}` }
        ]);
      }

      dispose() {
        this.arrowB0.dispose();
        this.arrowI1.dispose();
      }
    }

    // ============================================================================
    // 46. МОДУЛЬ § 46: ТРАНСФОРМАТОР ЗМІННОГО СТРУМУ ТА ВЗАЄМНА ІНДУКЦІЯ
    // ============================================================================
    class TransformerInductionSimulation {
      constructor() {
        this.fluxDots = [];
        this.primaryTurns = [];
        this.secondaryTurns = [];
        this.buildScene();
        this.reset();
      }

      buildScene() {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(11.5, 0.36, 5.2),
          new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.65 })
        );
        base.position.set(0, 0.18, 0);
        base.receiveShadow = true;
        worldGroup.add(base);

        // Замкнене шихтоване феромагнітне осердя трансформатора
        const coreMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.72, roughness: 0.32 });
        const topYoke = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.72, 1.1), coreMat);
        topYoke.position.set(0, 4.35, 0);
        const botYoke = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.72, 1.1), coreMat);
        botYoke.position.set(0, 0.85, 0);
        const leftLimb = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.8, 1.1), coreMat);
        leftLimb.position.set(-2.35, 2.6, 0);
        const rightLimb = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.8, 1.1), coreMat);
        rightLimb.position.set(2.35, 2.6, 0);
        worldGroup.add(topYoke, botYoke, leftLimb, rightLimb);

        // Первинна обмотка N₁ (лівий стержень) та вторинна обмотка N₂ (правий стержень)
        const cop1Mat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.22 });
        const cop2Mat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.75, roughness: 0.25 });
        const turnGeo = new THREE.BoxGeometry(1.18, 0.09, 1.38);

        for (let i = 0; i < 16; i++) {
          const t1 = new THREE.Mesh(turnGeo, cop1Mat);
          const t2 = new THREE.Mesh(turnGeo, cop2Mat);
          worldGroup.add(t1, t2);
          this.primaryTurns.push(t1);
          this.secondaryTurns.push(t2);
        }

        // Лампа навантаження у вторинному колі справа
        this.bulbMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 24, 24),
          new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 0.5 })
        );
        this.bulbMesh.position.set(4.3, 2.6, 0);
        worldGroup.add(this.bulbMesh);

        // Маркери спільного змінного магнітного потоку Φ(t) уздовж прямокутного осердя
        const fGeo = new THREE.SphereGeometry(0.09, 12, 12);
        const fMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
        for (let i = 0; i < 24; i++) {
          const d = new THREE.Mesh(fGeo, fMat);
          worldGroup.add(d);
          this.fluxDots.push({ mesh: d, baseU: i / 24 });
        }

        this.arrowFlux = new SmartVectorArrow('Φ(t) (магнітний потік)', 0x16a34a, '#16a34a');
        this.arrowU1 = new SmartVectorArrow('U₁ (первинна обмотка)', 0xd97706, '#d97706');
        this.arrowU2 = new SmartVectorArrow('U₂ (вторинна обмотка)', 0x1d4ed8, '#1d4ed8');
      }

      pointOnCoreLoop(u) {
        const uNorm = ((u % 1) + 1) % 1;
        if (uNorm < 0.25) {
          const k = uNorm / 0.25;
          return new THREE.Vector3(-2.35, 0.85 + k * 3.5, 0.62);
        } else if (uNorm < 0.5) {
          const k = (uNorm - 0.25) / 0.25;
          return new THREE.Vector3(-2.35 + k * 4.7, 4.35, 0.62);
        } else if (uNorm < 0.75) {
          const k = (uNorm - 0.5) / 0.25;
          return new THREE.Vector3(2.35, 4.35 - k * 3.5, 0.62);
        } else {
          const k = (uNorm - 0.75) / 0.25;
          return new THREE.Vector3(2.35 - k * 4.7, 0.85, 0.62);
        }
      }

      reset() {
        this.phaseTriggered = false;
        this.syncVisuals();
      }

      syncVisuals() {
        const p = sceneParams.transformer;
        const n1Vis = Math.max(3, Math.round((p.turnsN1 / 50) * 16));
        const n2Vis = Math.max(3, Math.round((p.turnsN2 / 80) * 16));

        this.primaryTurns.forEach((t, idx) => {
          t.visible = idx < n1Vis;
          if (t.visible) {
            const u = (idx + 0.5) / n1Vis;
            t.position.set(-2.35, 1.4 + u * 2.4, 0);
          }
        });

        this.secondaryTurns.forEach((t, idx) => {
          t.visible = idx < n2Vis;
          if (t.visible) {
            const u = (idx + 0.5) / n2Vis;
            t.position.set(2.35, 1.4 + u * 2.4, 0);
          }
        });

        const omega = 2 * Math.PI * p.acFreqHz * 0.45;
        const sinVal = Math.sin(omega * uiState.simTime);
        const cosVal = Math.cos(omega * uiState.simTime);
        const ratio = p.turnsN2 / p.turnsN1;
        const u2Rms = p.voltageU1 * ratio;

        this.bulbMesh.material.emissiveIntensity = Math.min(2.2, 0.15 + (u2Rms / 180) * (0.4 + 0.6 * cosVal * cosVal));

        this.fluxDots.forEach(fd => {
          fd.mesh.visible = uiState.showParticles;
          const pos = this.pointOnCoreLoop(fd.baseU + 0.08 * sinVal);
          fd.mesh.position.copy(pos);
        });

        this.updateUI();
      }

      update(dt) {
        this.syncVisuals();
        if (uiState.simTime > 2.2 && !this.phaseTriggered && uiState.phase === 'test') {
          this.phaseTriggered = true;
          transitionToPhase('explain');
        }
      }

      updateUI() {
        const p = sceneParams.transformer;
        const ratio = p.turnsN2 / p.turnsN1;
        const u2Rms = p.voltageU1 * ratio;
        const omega = 2 * Math.PI * p.acFreqHz * 0.45;
        const sinVal = Math.sin(omega * uiState.simTime);
        const cosVal = Math.cos(omega * uiState.simTime);

        this.arrowFlux.update(
          new THREE.Vector3(0, 4.75, 0),
          new THREE.Vector3(sinVal >= 0 ? 1 : -1, 0, 0),
          Math.max(0.25, Math.abs(sinVal) * 2.1),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowU1.update(
          new THREE.Vector3(-2.35, 2.6, 0.9),
          new THREE.Vector3(0, cosVal >= 0 ? 1 : -1, 0),
          Math.max(0.25, Math.abs(cosVal) * (p.voltageU1 / 110) * 1.4),
          uiState.showVectors,
          uiState.showLabels
        );

        this.arrowU2.update(
          new THREE.Vector3(2.35, 2.6, 0.9),
          new THREE.Vector3(0, cosVal >= 0 ? -1 : 1, 0),
          Math.max(0.25, Math.abs(cosVal) * (u2Rms / 110) * 1.4),
          uiState.showVectors,
          uiState.showLabels
        );

        const p2Instant = (u2Rms * u2Rms) / 250 * (cosVal * cosVal);
        const wFlux = (p.voltageU1 / 110) * 35 * (sinVal * sinVal);
        const qLoss = p2Instant * 0.04;

        updateEnergyUI(p2Instant, wFlux, qLoss, Math.max(10, p2Instant + wFlux + qLoss), [
          { label: 'Коефіцієнт k = N₂/N₁', val: `${ratio.toFixed(2)}` },
          { label: 'Первинна напруга U₁', val: `${p.voltageU1.toFixed(0)} В` },
          { label: 'Вторинна напруга U₂', val: `${u2Rms.toFixed(1)} В` },
          { label: 'Режим трансформатора', val: ratio > 1.02 ? 'Підвищувальний (U₂ > U₁)' : (ratio < 0.98 ? 'Знижувальний (U₂ < U₁)' : 'Ізолювальний (1:1)') }
        ]);
      }

      dispose() {
        this.arrowFlux.dispose();
        this.arrowU1.dispose();
        this.arrowU2.dispose();
      }
    }

    // ============================================================================
    // 12. BILINGUAL LOCALIZATION SYSTEM (ENGLISH DEFAULT + UKRAINIAN) & UI UPDATES
    // ============================================================================
    const SCENE_UK = {};
    Object.keys(SCENE_CONFIGS).forEach(k => {
      const c = SCENE_CONFIGS[k];
      SCENE_UK[k] = {
        secTag: c.secTag,
        shortTitle: c.shortTitle,
        subtitle: c.subtitle,
        badge: c.badge,
        categoryGroupTitle: c.categoryGroupTitle,
        title: c.title,
        epigraph: c.epigraph,
        figCaption: c.figCaption,
        ekLabel: c.ekLabel,
        epLabel: c.epLabel,
        qLabel: c.qLabel,
        question: c.question,
        options: [...c.options],
        explanation: c.explanation,
        referenceLatex: c.referenceLatex,
        formulaLatex: c.formulaLatex,
        liveLatexFn: c.liveLatexFn,
        sliders: c.sliders.map(s => ({ ...s }))
      };
    });

    const SCENE_EN = {
      collision: {
        secTag: 'Section § 1 — Mechanics · Conservation Laws',
        shortTitle: 'Conservation of Momentum',
        subtitle: 'Elastic & inelastic collision of spheres, momentum exchange',
        badge: 'Collisions',
        categoryGroupTitle: 'Part I. Classical Mechanics & Oscillations',
        title: 'Conservation of Linear Momentum',
        epigraph: 'In a closed mechanical system, the vector sum of momenta of all bodies remains constant under any mutual interactions.',
        figCaption: 'Fig. 1.1 — Redistribution of kinetic energy during the collision of two spheres',
        ekLabel: 'Kinetic E_k',
        epLabel: 'Deform. E_p',
        qLabel: 'Heat Q',
        question: 'A sphere of mass $m_1 = 2\\text{ kg}$ moving at velocity $v_1 = 4\\text{ m/s}$ undergoes a head-on perfectly elastic collision ($e = 1$) with an identical stationary sphere of mass $m_2 = 2\\text{ kg}$. What will their velocities be after impact?',
        options: [
          'Both spheres will move together at velocity $u = 2\\text{ m/s}$',
          'The first sphere stops ($v_1\' = 0$), and the second receives all its velocity ($v_2\' = 4\\text{ m/s}$)',
          'The first sphere rebounds backward at $-4\\text{ m/s}$ while the second remains stationary'
        ],
        explanation: 'By conservation of momentum and mechanical energy, in a head-on perfectly elastic collision ($e=1$) of two spheres of equal mass ($m_1 = m_2$), a complete exchange of velocities occurs. When the collision is inelastic ($e < 1$), part of the kinetic energy is converted into internal thermal energy $\\Delta Q = \\frac{1}{2}\\mu_{\\text{red}} v_{\\text{rel}}^2 (1 - e^2)$.',
        referenceLatex: String.raw`\begin{aligned}
          \vec{p}_1 + \vec{p}_2 &= \vec{p}_1' + \vec{p}_2' = \text{const} \\
          v_1' &= \frac{(m_1 - e m_2)v_1 + (1+e)m_2 v_2}{m_1 + m_2}
        \end{aligned}`,
        formulaLatex: String.raw`v_1' = \frac{(m_1 - e m_2)v_1 + (1+e)m_2 v_2}{m_1 + m_2}, \quad v_2' = \frac{(m_2 - e m_1)v_2 + (1+e)m_1 v_1}{m_1 + m_2}`,
        liveLatexFn: p => {
          const v1p = ((p.m1 - p.restitution * p.m2) * p.v1 + (1 + p.restitution) * p.m2 * p.v2) / (p.m1 + p.m2);
          const v2p = ((p.m2 - p.restitution * p.m1) * p.v2 + (1 + p.restitution) * p.m1 * p.v1) / (p.m1 + p.m2);
          return String.raw`v_1' = ${v1p.toFixed(2)}\text{ m/s}, \quad v_2' = ${v2p.toFixed(2)}\text{ m/s}`;
        },
        sliders: [
          { label: 'Mass of 1st sphere m₁', unit: 'kg' },
          { label: 'Mass of 2nd sphere m₂', unit: 'kg' },
          { label: 'Initial velocity v₁', unit: 'm/s' },
          { label: 'Initial velocity v₂', unit: 'm/s' },
          { label: 'Restitution coeff. e', unit: '' },
          { label: 'Impact offset Δz', unit: 'm' }
        ]
      },
      incline: {
        secTag: 'Section § 2 — Point-Mass Dynamics',
        shortTitle: 'Motion on an Inclined Plane',
        subtitle: 'Resolution of gravity, normal force N, and friction angle',
        badge: 'Dynamics',
        categoryGroupTitle: 'Part I. Classical Mechanics & Oscillations',
        title: 'Motion of a Body on an Inclined Plane',
        epigraph: 'Resolving gravity along mutually perpendicular axes determines the equilibrium condition and acceleration of a body on a slope.',
        figCaption: 'Fig. 2.1 — Conversion of potential energy mgh into kinetic energy and frictional heat',
        ekLabel: 'Kinetic E_k',
        epLabel: 'Potent. mgh',
        qLabel: 'Friction Q',
        question: 'A block rests on an inclined plane at angle $\\alpha = 30^\\circ$ with sliding friction coefficient $\\mu = 0.25$. Under what condition will the block start sliding down on its own?',
        options: [
          'Only if the block mass $m$ exceeds a critical threshold of $5\\text{ kg}$',
          'When the downhill gravity component exceeds maximum static friction: $\\tan\\alpha > \\mu$',
          'When the normal reaction force $N = mg\\cos\\alpha$ becomes greater than $mg$'
        ],
        explanation: 'In the inequality $mg\\sin\\alpha > \\mu mg\\cos\\alpha$, the mass $m$ cancels out! Thus, the condition for sliding depends solely on the incline angle and friction coefficient: $\\tan\\alpha > \\mu$ (the incline angle must exceed the angle of repose $\\varphi = \\arctan\\mu$).',
        referenceLatex: String.raw`\begin{aligned}
          m\vec{a} &= m\vec{g} + \vec{N} + \vec{F}_{\text{fric}} \\
          a &= g(\sin\alpha - \mu\cos\alpha), \quad N = mg\cos\alpha
        \end{aligned}`,
        formulaLatex: String.raw`a = g(\sin\alpha - \mu\cos\alpha), \quad F_{\text{fric}} = \mu mg\cos\alpha, \quad \tan\alpha > \mu`,
        liveLatexFn: p => {
          const rad = (p.angle * Math.PI) / 180;
          const acc = Math.max(0, p.gravity * (Math.sin(rad) - p.mu * Math.cos(rad)));
          return String.raw`\tan(${p.angle}^\circ) = ${Math.tan(rad).toFixed(2)}, \quad \mu = ${p.mu.toFixed(2)} \implies a = ${acc.toFixed(2)}\text{ m/s}^2`;
        },
        sliders: [
          { label: 'Incline angle α', unit: '°' },
          { label: 'Friction coeff. μ', unit: '' },
          { label: 'Block mass m', unit: 'kg' },
          { label: 'Gravity g', unit: 'm/s²' }
        ]
      },
      pendulum: {
        secTag: 'Section § 3 — Mechanical Oscillations',
        shortTitle: 'Simple & Spring Pendulums',
        subtitle: 'Comparison of periods T = 2π√(L/g) and T = 2π√(m/k)',
        badge: 'Oscillations',
        categoryGroupTitle: 'Part I. Classical Mechanics & Oscillations',
        title: 'Simple & Spring Pendulums',
        epigraph: 'Harmonic oscillations involve periodic conversion between potential energy of displacement and kinetic energy of motion.',
        figCaption: 'Fig. 3.1 — Anti-phase oscillations of kinetic and potential energy',
        ekLabel: 'Kinetic E_k',
        epLabel: 'Potential E_p',
        qLabel: 'Dissipation Q',
        question: 'How do the small-oscillation periods of a simple pendulum $T_{\\text{pend}}$ and a spring pendulum $T_{\\text{spr}}$ change if the bob mass $m$ is quadrupled ($4\\times$)?',
        options: [
          'The period of both pendulums increases by a factor of $2$',
          'The simple pendulum period remains unchanged, while the spring pendulum period doubles ($2\\times$)',
          'The simple pendulum period doubles, while the spring pendulum period stays unchanged'
        ],
        explanation: 'For a simple pendulum, both the gravitational restoring force and inertia are proportional to mass $m$, so $T_{\\text{pend}} = 2\\pi\\sqrt{L/g}$ is independent of mass! In contrast, Hooke\'s restoring force $F = -kx$ in a spring does not depend on mass, so quadrupling $m$ doubles the period $T_{\\text{spr}} = 2\\pi\\sqrt{m/k}$.',
        referenceLatex: String.raw`\begin{aligned}
          T_{\text{pend}} &= 2\pi\sqrt{\frac{L}{g}}, \qquad T_{\text{spr}} = 2\pi\sqrt{\frac{m}{k}} \\
          E &= \frac{mv^2}{2} + mgL(1-\cos\theta) = \text{const}
        \end{aligned}`,
        formulaLatex: String.raw`\ddot{\theta} + 2\gamma\dot{\theta} + \frac{g}{L}\sin\theta = 0, \qquad \ddot{y} + 2\gamma\dot{y} + \frac{k}{m}y = 0`,
        liveLatexFn: p => {
          const tm = 2 * Math.PI * Math.sqrt(p.length / p.gravity);
          const ts = 2 * Math.PI * Math.sqrt(p.mass / p.stiffness);
          return String.raw`T_{\text{pend}} = ${tm.toFixed(2)}\text{ s}, \qquad T_{\text{spr}} = ${ts.toFixed(2)}\text{ s}`;
        },
        sliders: [
          { label: 'String length L', unit: 'm' },
          { label: 'Initial amplitude θ₀', unit: '°' },
          { label: 'Bob mass m', unit: 'kg' },
          { label: 'Spring stiffness k', unit: 'N/m' },
          { label: 'Damping coeff. γ', unit: 's⁻¹' }
        ]
      },
      projectile: {
        secTag: 'Section § 4 — Curvilinear Kinematics',
        shortTitle: 'Ballistics: Projectile Motion',
        subtitle: 'Vacuum parabola vs. ballistic trajectory with air drag',
        badge: 'Kinematics',
        categoryGroupTitle: 'Part I. Classical Mechanics & Oscillations',
        title: 'Projectile Launched at an Angle to the Horizontal',
        epigraph: 'Ballistic motion in a uniform gravitational field is a superposition of uniform horizontal motion along Ox and uniformly accelerated vertical motion along Oy.',
        figCaption: 'Fig. 4.1 — Balance of kinetic and potential energy along the parabolic trajectory',
        ekLabel: 'Kinetic E_k',
        epLabel: 'Potent. mgh',
        qLabel: 'Air Drag Q',
        question: 'A projectile is launched at $\\theta = 45^\\circ$ to the horizontal in vacuum ($c_d = 0$). What is its kinetic energy $E_k$ at the highest point (apex) of the trajectory compared to its initial kinetic energy $E_{k0} = \\frac{1}{2}mv_0^2$?',
        options: [
          'At the apex $E_k = 0$ because the body momentarily comes to a complete stop',
          'At the apex $v_y = 0$, but $v_x = v_0\\cos 45^\\circ$, so $E_k = E_{k0}\\cos^2 45^\\circ = \\frac{1}{2}E_{k0}$',
          'Kinetic energy at the apex equals the initial value $E_{k0}$'
        ],
        explanation: 'At the vertex of the parabola only the vertical velocity component vanishes ($v_y = 0$), while the horizontal component $v_x = v_0\\cos\\theta$ remains constant. Therefore, the minimum kinetic energy at the apex is $E_{k,\\min} = \\frac{1}{2}m(v_0\\cos\\theta)^2 = E_{k0}\\cos^2\\theta$.',
        referenceLatex: String.raw`\begin{aligned}
          x(t) &= v_0\cos\theta\cdot t, \quad y(t) = h_0 + v_0\sin\theta\cdot t - \frac{gt^2}{2} \\
          H_{\max} &= h_0 + \frac{v_0^2\sin^2\theta}{2g}, \quad L = \frac{v_0^2\sin 2\theta}{g}
        \end{aligned}`,
        formulaLatex: String.raw`v_{\text{apex}} = v_x = v_0\cos\theta, \qquad E_{k,\min} = E_{k0}\cos^2\theta`,
        liveLatexFn: p => {
          const rad = (p.angle * Math.PI) / 180;
          const vx = p.v0 * Math.cos(rad);
          const hmax = p.h0 + Math.pow(p.v0 * Math.sin(rad), 2) / (2 * p.gravity);
          return String.raw`v_x = ${vx.toFixed(2)}\text{ m/s}, \qquad H_{\max}^{\text{vac}} = ${hmax.toFixed(2)}\text{ m}`;
        },
        sliders: [
          { label: 'Initial velocity v₀', unit: 'm/s' },
          { label: 'Launch angle θ', unit: '°' },
          { label: 'Initial height h₀', unit: 'm' },
          { label: 'Air drag coeff. c_d', unit: 'kg/m' },
          { label: 'Projectile mass m', unit: 'kg' }
        ]
      },
      cradle: {
        secTag: 'Section § 5 — Cascading Elastic Collisions',
        shortTitle: 'Newton\'s Cradle',
        subtitle: 'Transmission of momentum and energy through a chain of steel spheres',
        badge: 'Collision Cascade',
        categoryGroupTitle: 'Part I. Classical Mechanics & Oscillations',
        title: 'Newton\'s Cradle',
        epigraph: 'Simultaneous satisfaction of momentum and mechanical energy conservation uniquely dictates not only the total momentum, but also the exact number of rebounding spheres.',
        figCaption: 'Fig. 5.1 — Propagation of a momentum pulse through a chain of steel spheres',
        ekLabel: 'Kinetic E_k',
        epLabel: 'Potential E_p',
        qLabel: 'Losses Q',
        question: 'In a Newton\'s cradle of $5$ identical steel spheres, $N = 2$ spheres on the left are pulled back and released together with impact speed $v$. Why cannot just $1$ sphere fly out on the right with double speed $2v$?',
        options: [
          'Because that would violate conservation of linear momentum ($2mv \\neq m(2v)$)',
          'Momentum would be conserved ($2mv = m\\cdot 2v$), but kinetic energy would double ($\\frac{1}{2}m(2v)^2 = 2mv^2 > mv^2$), violating energy conservation!',
          'Because the outermost sphere has greater string tension than the middle spheres'
        ],
        explanation: 'If a single sphere rebounded at speed $2v$, its momentum would be $2mv$ (momentum conserved), but its kinetic energy would be $\\frac{1}{2}m(2v)^2 = 2mv^2$, whereas the initial kinetic energy of the two incoming spheres was $2\\cdot\\frac{1}{2}mv^2 = mv^2$. The unique solution to both conservation equations is that $N_{\\text{out}} = N_{\\text{in}}$ spheres rebound with speed $u = v$!',
        referenceLatex: String.raw`\begin{cases}
          N_{\text{in}} m v = N_{\text{out}} m u \\
          N_{\text{in}} \dfrac{mv^2}{2} = N_{\text{out}} \dfrac{mu^2}{2}
        \end{cases} \implies N_{\text{out}} = N_{\text{in}}, \; u = v`,
        formulaLatex: String.raw`N_{\text{out}} = N_{\text{in}}, \qquad u = v \quad (\text{for } e = 1)`,
        liveLatexFn: p => {
          return String.raw`N_{\text{active}} = ${p.liftedBalls}, \qquad \theta_0 = ${p.theta0}^\circ, \qquad e = ${p.restitution.toFixed(2)}`;
        },
        sliders: [
          { label: 'Lifted spheres N', unit: 'pcs' },
          { label: 'Release angle θ₀', unit: '°' },
          { label: 'Steel restitution e', unit: '' },
          { label: 'Suspension length L', unit: 'm' }
        ]
      },
      centripetal: {
        secTag: 'Section § 6 — Circular Motion Dynamics',
        shortTitle: 'Circular Motion & Centripetal Force',
        subtitle: 'Centripetal acceleration a = ω²R and radial skidding threshold',
        badge: 'Rotation',
        categoryGroupTitle: 'Part I. Classical Mechanics & Oscillations',
        title: 'Centripetal Acceleration & Turning Dynamics',
        epigraph: 'Any curvilinear motion is accelerated: the velocity vector continuously changes direction due to a centripetal force directed toward the center of curvature.',
        figCaption: 'Fig. 6.1 — Balance between required centripetal force and maximum static friction',
        ekLabel: 'Kinetic E_k',
        epLabel: 'Friction Margin',
        qLabel: 'Skidding Q',
        question: 'A block rests on a horizontal rotating turntable at radius $R$ from the axis. How does the centripetal acceleration $a_c = \\omega^2 R$ change if the disk\'s angular velocity $\\omega$ is doubled?',
        options: [
          'Centripetal acceleration and required static friction increase by a factor of $4$',
          'Centripetal acceleration remains unchanged because radius $R$ is constant',
          'Centripetal acceleration decreases by half'
        ],
        explanation: 'Since $a_c = \\omega^2 R = v^2 / R$, doubling the angular velocity $\\omega$ increases the centripetal acceleration fourfold ($4\\times$). Once the required centripetal force $m\\omega^2 R$ exceeds the maximum static friction force $\\mu mg$, the body breaks traction and skids radially outward!',
        referenceLatex: String.raw`\begin{aligned}
          a_c &= \frac{v^2}{R} = \omega^2 R, \qquad F_c = m\omega^2 R \\
          \omega_{\text{cr}} &= \sqrt{\frac{\mu g}{R}} \quad (\text{no-slip condition})
        \end{aligned}`,
        formulaLatex: String.raw`m\omega^2 R \le \mu mg \implies \omega \le \omega_{\text{cr}} = \sqrt{\frac{\mu g}{R}}`,
        liveLatexFn: p => {
          const fReq = p.mass * p.omega * p.omega * p.radius;
          const fMax = p.mu * p.mass * 9.81;
          const status = fReq <= fMax ? '\\text{Holds Grip}' : '\\text{Radial Skid!}';
          return String.raw`F_c = ${fReq.toFixed(1)}\text{ N}, \quad F_{\text{fric},\max} = ${fMax.toFixed(1)}\text{ N} \; (${status})`;
        },
        sliders: [
          { label: 'Disk angular velocity ω', unit: 'rad/s' },
          { label: 'Orbit radius R', unit: 'm' },
          { label: 'Static friction coeff. μ', unit: '' },
          { label: 'Body mass m', unit: 'kg' }
        ]
      },
      archimedes: {
        secTag: 'Section § 7 — Fluid Statics & Buoyancy',
        shortTitle: 'Archimedes\' Principle & Flotation',
        subtitle: 'Buoyant force F_A = ρgV and equilibrium at the waterline',
        badge: 'Hydrostatics',
        categoryGroupTitle: 'Part II. Fluid Mechanics & Molecular Kinetic Theory',
        title: 'Archimedes\' Principle & Flotation Conditions',
        epigraph: 'A body immersed in a fluid experiences an upward buoyant force equal to the weight of the fluid displaced by the submerged portion of the body.',
        figCaption: 'Fig. 7.1 — Damped vertical oscillations of a body near its equilibrium waterline',
        ekLabel: 'Kinetic E_k',
        epLabel: 'Hydrostat. E_p',
        qLabel: 'Viscosity Q',
        question: 'A solid cube of density $\\rho_{\\text{body}} = 600\\text{ kg/m}^3$ is placed into fresh water ($\\rho_{\\text{water}} = 1000\\text{ kg/m}^3$). What fraction of the cube\'s volume will be submerged in equilibrium?',
        options: [
          'Exactly half of its volume ($50\\%$), regardless of the body\'s density',
          'The submerged volume fraction equals the density ratio: $\\rho_{\\text{body}}/\\rho_{\\text{water}} = 60\\%$',
          'The cube will sink completely to the bottom of the vessel ($100\\%$)'
        ],
        explanation: 'In static equilibrium of a floating body, gravity is balanced by the Archimedes buoyant force: $\\rho_{\\text{body}} g V_0 = \\rho_{\\text{fluid}} g V_{\\text{sub}}$. Hence the submerged fraction is $V_{\\text{sub}}/V_0 = \\rho_{\\text{body}}/\\rho_{\\text{fluid}} = 600/1000 = 0.6$ ($60\\%$). If $\\rho_{\\text{body}} > \\rho_{\\text{fluid}}$, the body sinks.',
        referenceLatex: String.raw`\begin{aligned}
          F_A &= \rho_{\text{fluid}} g V_{\text{sub}}, \qquad F_g = \rho_{\text{body}} g V_0 \\
          \frac{V_{\text{sub}}}{V_0} &= \frac{\rho_{\text{body}}}{\rho_{\text{fluid}}} \quad (\text{for } \rho_{\text{body}} \le \rho_{\text{fluid}})
        \end{aligned}`,
        formulaLatex: String.raw`\rho_{\text{body}} g V_0 = \rho_{\text{fluid}} g V_{\text{sub}} \implies \frac{h_{\text{sub}}}{H} = \frac{\rho_{\text{body}}}{\rho_{\text{fluid}}}`,
        liveLatexFn: p => {
          const ratio = Math.min(1, p.rhoBody / p.rhoFluid) * 100;
          const state = p.rhoBody < p.rhoFluid ? '\\text{Floats}' : p.rhoBody === p.rhoFluid ? '\\text{Neutral Buoyancy}' : '\\text{Sinks}';
          return String.raw`\frac{V_{\text{sub}}}{V_0} = ${ratio.toFixed(0)}\% \quad (${state})`;
        },
        sliders: [
          { label: 'Body density ρ_body', unit: 'kg/m³' },
          { label: 'Fluid density ρ_fluid', unit: 'kg/m³' },
          { label: 'Cube side length a', unit: 'm' },
          { label: 'Fluid viscosity η', unit: 'Pa·s' }
        ]
      },
      gas: {
        secTag: 'Section § 8 — Molecular Kinetic Theory',
        shortTitle: 'Ideal Gas Under a Piston (MKT)',
        subtitle: 'Ideal gas law PV = νRT and thermal motion of molecules',
        badge: 'Thermodynamics',
        categoryGroupTitle: 'Part II. Fluid Mechanics & Molecular Kinetic Theory',
        title: 'Ideal Gas Under a Piston (Ideal Gas Law)',
        epigraph: 'Gas pressure on the vessel walls and piston arises from the cumulative impulse of countless elastic molecular collisions in chaotic thermal motion.',
        figCaption: 'Fig. 8.1 — Internal energy U and gas expansion work A under temperature changes',
        ekLabel: 'Internal U (E_k)',
        epLabel: 'Piston Work A',
        qLabel: 'Heat Exchange Q',
        question: 'An ideal gas is enclosed in a vertical cylinder under a heavy freely movable piston of constant mass ($P = P_0 + Mg/S = \\text{const}$). How do the gas volume $V$ and root-mean-square molecular speed $v_{\\text{rms}}$ change if the absolute temperature $T$ is doubled?',
        options: [
          'Volume $V$ stays constant while pressure doubles',
          'By Gay-Lussac\'s law ($P = \\text{const}$) volume $V$ doubles, while molecular RMS speed $v_{\\text{rms}} \\propto \\sqrt{T}$ increases by $\\sqrt{2}$',
          'Molecules come to rest near the upper surface of the piston'
        ],
        explanation: 'With a freely moving piston of constant weight, the process is isobaric ($P = \\text{const}$). From the ideal gas law $V/T = \\text{const}$, heating the gas proportionally raises the piston ($V \\propto T$), while the mean translational kinetic energy of molecules increases as $\\overline{E}_k = \\frac{3}{2}k_B T$.',
        referenceLatex: String.raw`\begin{aligned}
          P V &= \nu R T, \qquad P = \frac{1}{3} n m_0 \overline{v^2} \\
          \overline{E}_k &= \frac{3}{2} k_B T, \qquad Q = \Delta U + P\Delta V
        \end{aligned}`,
        formulaLatex: String.raw`\frac{V}{T} = \frac{\nu R}{P} = \text{const}, \qquad v_{\text{rms}} = \sqrt{\frac{3RT}{M}}`,
        liveLatexFn: p => {
          const rawVol = (p.temperature / 300) * (1.5 / p.pistonLoad) * 2.4;
          return String.raw`T = ${p.temperature}\text{ K}, \quad P = ${p.pistonLoad.toFixed(1)}\text{ atm}, \quad V = ${rawVol.toFixed(2)}\text{ L}`;
        },
        sliders: [
          { label: 'Absolute temperature T', unit: 'K' },
          { label: 'External piston pressure P', unit: 'atm' },
          { label: 'Model particle count N', unit: 'mol' }
        ]
      },
      wavefront: {
        secTag: 'Section § 9 — Wave Optics & Light Wavefront',
        shortTitle: 'Light Wavefront & Huygens\' Principle',
        subtitle: 'Huygens\' secondary spherical wavelets and plane wavefront refraction',
        badge: 'Light Wavefront',
        categoryGroupTitle: 'Part III. Light Phenomena, Wavefront & Optics',
        title: 'Light Wavefront & Huygens–Fresnel Principle',
        epigraph: 'Every point of a medium reached by a light wavefront becomes a source of secondary hemispherical wavelets, whose envelope forms the new wavefront at the next instant.',
        figCaption: 'Fig. 9.1 — Light energy flux: incident, refracted, and reflected wavefronts',
        ekLabel: 'Refracted Flux T',
        epLabel: 'Reflected Flux R',
        qLabel: 'Phase Delay',
        question: 'A plane light wavefront passes from air ($n_1 = 1.0$) into optically denser glass ($n_2 = 1.5$) at an angle of incidence $\\alpha > 0$. Why does the plane of the light wavefront bend toward the normal ($\\gamma < \\alpha$)?',
        options: [
          'Because the light frequency $\\nu$ increases by $1.5\\times$ inside the glass',
          'Because Huygens\' secondary spherical wavelets propagate slower in glass ($v_2 = c/n_2 < c$) and the wavelength spacing $\\lambda_2 = \\lambda_0/n_2$ compresses',
          'Because the light wavefront accelerates inside the glass ($v_2 > c$)'
        ],
        explanation: 'According to Huygens\' principle, as an oblique light wavefront reaches the interface, its left edge enters the glass first and emits secondary hemispherical wavelets that travel at a lower phase velocity $v_2 = c/n_2$. While the right edge travels $v_1 \\Delta t$ in air, the left edge travels only $v_2 \\Delta t$ in glass, rotating the wavefront envelope so that $\\sin\\alpha / \\sin\\gamma = v_1 / v_2 = n_2 / n_1$.',
        referenceLatex: String.raw`\begin{aligned}
          \frac{\sin\alpha}{\sin\gamma} &= \frac{v_1}{v_2} = \frac{n_2}{n_1}, \qquad v = \frac{c}{n} \\
          \lambda_2 &= \frac{\lambda_0}{n_2}, \qquad \Phi(\vec{r}, t) = \vec{k}\cdot\vec{r} - \omega t = \text{const}
        \end{aligned}`,
        formulaLatex: String.raw`n_1\sin\alpha = n_2\sin\gamma, \qquad v_2 = \frac{c}{n_2}, \qquad \lambda_2 = \frac{\lambda_0}{n_2}`,
        liveLatexFn: p => {
          const radA = (p.angle * Math.PI) / 180;
          const sinG = Math.sin(radA) / p.n2;
          const degG = (Math.asin(Math.min(1, sinG)) * 180) / Math.PI;
          const v2 = 300 / p.n2;
          return String.raw`\alpha = ${p.angle}^\circ \implies \gamma = ${degG.toFixed(1)}^\circ, \quad v_2 = ${v2.toFixed(0)}\text{k km/s}, \quad \lambda_2 = ${(p.wavelength / p.n2).toFixed(0)}\text{ nm}`;
        },
        sliders: [
          { label: 'Wavefront incidence angle α', unit: '°' },
          { label: 'Medium refractive index n₂', unit: '' },
          { label: 'Vacuum wavelength λ₀', unit: 'nm' },
          { label: 'Huygens wavelet sources N', unit: 'sources' }
        ]
      },
      interference: {
        secTag: 'Section § 10 — Coherent Light Waves',
        shortTitle: 'Light Interference (Young\'s Experiment)',
        subtitle: 'Superposition of two spherical light wavefronts, maxima & minima',
        badge: 'Coherence',
        categoryGroupTitle: 'Part III. Light Phenomena, Wavefront & Optics',
        title: 'Interference of Light Wavefronts (Young\'s Double-Slit)',
        epigraph: 'When two coherent light waves overlap, the spatial intensity distribution is governed by the phase difference between their wavefronts.',
        figCaption: 'Fig. 10.1 — Light intensity at the selected screen point as a function of path difference Δd',
        ekLabel: 'Intensity I(z)',
        epLabel: 'Coherent Term',
        qLabel: 'Cancellation',
        question: 'In Young\'s experiment, two coherent light wavefronts from slits $S_1$ and $S_2$ arrive at a point on the screen with an optical path difference $\\Delta d = 1.5\\lambda$ (three half-wavelengths). What is observed at this point?',
        options: [
          'An interference maximum ($I = 4I_0$), because the waves reinforce each other',
          'An interference minimum (dark fringe, $I = 0$), because the crest of one wavefront meets the trough of the other in anti-phase',
          'Uniform illumination $I = 2I_0$'
        ],
        explanation: 'When the path difference equals an odd number of half-wavelengths $\\Delta d = (m + \\frac{1}{2})\\lambda$, the phase difference is $\\Delta\\varphi = \\pi, 3\\pi, \\dots$ At this point, the crest of the wavefront from the first slit overlaps the trough from the second slit, resulting in destructive interference ($I = 0$).',
        referenceLatex: String.raw`\begin{aligned}
          \Delta d &= |r_2 - r_1| \approx \frac{d\cdot z}{L}, \qquad \Delta\varphi = \frac{2\pi}{\lambda}\Delta d \\
          I(z) &= 4 I_0 \cos^2\!\left(\frac{\pi d z}{\lambda L}\right), \qquad \Delta z_{\text{fr}} = \frac{\lambda L}{d}
        \end{aligned}`,
        formulaLatex: String.raw`\Delta d = m\lambda \; (\text{maximum}), \qquad \Delta d = \left(m + \frac{1}{2}\right)\lambda \; (\text{minimum})`,
        liveLatexFn: p => {
          const fringeWidth = (p.wavelength * 1e-3 * p.screenL) / p.slitD;
          const pathDiffLambda = (p.slitD * Math.abs(p.probeZ)) / (p.wavelength * 1e-3 * p.screenL);
          return String.raw`\Delta z_{\text{fringe}} = ${fringeWidth.toFixed(2)}\text{ mm}, \qquad \frac{\Delta d}{\lambda} = ${pathDiffLambda.toFixed(2)}`;
        },
        sliders: [
          { label: 'Light wavelength λ', unit: 'nm' },
          { label: 'Slit separation d', unit: 'mm' },
          { label: 'Distance to screen L', unit: 'm' },
          { label: 'Observation point on screen z', unit: 'mm' }
        ]
      },
      dispersion: {
        secTag: 'Section § 11 — Spectral & Geometrical Optics',
        shortTitle: 'Light Dispersion in a Prism',
        subtitle: 'Wavelength dependence of refractive index n(λ) and spectral splitting',
        badge: 'Light Spectrum',
        categoryGroupTitle: 'Part III. Light Phenomena, Wavefront & Optics',
        title: 'Dispersion of Light & Spectrum Formation in a Prism',
        epigraph: 'A narrow beam of white light in a glass prism splits into a rainbow spectrum because short violet waves have a lower phase velocity in glass than long red waves.',
        figCaption: 'Fig. 11.1 — Spectral distribution of deviation angles and phase velocities in a prism',
        ekLabel: 'Red (680nm)',
        epLabel: 'Green (530nm)',
        qLabel: 'Violet (410nm)',
        question: 'A white light beam passes through a triangular glass prism. Rays of which color are refracted through the largest deviation angle $\\delta$ and why?',
        options: [
          'Red rays ($\\lambda \\approx 680\\text{ nm}$), because they have the longest wavelength',
          'Violet rays ($\\lambda \\approx 410\\text{ nm}$), because glass has a higher refractive index at shorter wavelengths ($n_{\\text{viol}} > n_{\\text{red}}$) and the lowest wavefront speed',
          'All colors refract at the exact same angle'
        ],
        explanation: 'Under normal dispersion, the refractive index increases monotonically as wavelength decreases according to Cauchy\'s law $n(\\lambda) = n_0 + B/\\lambda^2$. Since $\\lambda_{\\text{viol}} < \\lambda_{\\text{red}}$, the violet wavefront slows down more strongly in glass ($v_{\\text{viol}} < v_{\\text{red}}$), so $n_{\\text{viol}} > n_{\\text{red}}$ and violet rays bend most toward the prism base.',
        referenceLatex: String.raw`\begin{aligned}
          n(\lambda) &= n_0 + \frac{B}{\lambda^2} \quad (\text{Cauchy's Law}), \qquad v(\lambda) = \frac{c}{n(\lambda)} \\
          \delta(\lambda) &= \alpha_1 + \arcsin\!\big(n(\lambda)\sin(\varphi - \gamma_1)\big) - \varphi
        \end{aligned}`,
        formulaLatex: String.raw`\lambda_{\text{viol}} < \lambda_{\text{red}} \implies n_{\text{viol}} > n_{\text{red}} \implies \delta_{\text{viol}} > \delta_{\text{red}}`,
        liveLatexFn: p => {
          const nRed = p.n0 + (p.cauchyB * 0.25) / (0.68 * 0.68);
          const nViol = p.n0 + (p.cauchyB * 0.25) / (0.405 * 0.405);
          return String.raw`n_{\text{red}} = ${nRed.toFixed(3)}, \quad n_{\text{viol}} = ${nViol.toFixed(3)}, \quad \Delta n = ${(nViol - nRed).toFixed(3)}`;
        },
        sliders: [
          { label: 'Prism apex angle φ', unit: '°' },
          { label: 'Incident beam angle α₁', unit: '°' },
          { label: 'Base glass index n₀', unit: '' },
          { label: 'Cauchy dispersion coeff. B', unit: 'μm²' }
        ]
      },
      emwave: {
        secTag: 'Section § 12 — Maxwell\'s Electromagnetic Theory of Light',
        shortTitle: 'Electromagnetic Wave & Poynting Flux',
        subtitle: 'Mutually perpendicular fields E ⊥ B, phase wavefront, and light polarization',
        badge: 'Nature of Light',
        categoryGroupTitle: 'Part III. Light Phenomena, Wavefront & Optics',
        title: 'Electromagnetic Light Wave (E, B & Poynting Vector)',
        epigraph: 'Light is a transverse electromagnetic wave: within every plane of the light wavefront, vectors E and B oscillate in phase perpendicular to the direction of propagation.',
        figCaption: 'Fig. 12.1 — Instantaneous energy density of the electric w_E and magnetic w_B fields',
        ekLabel: 'Electric w_E',
        epLabel: 'Magnetic w_B',
        qLabel: 'Poynting Flux S',
        question: 'How are the electric field vector $\\vec{E}$ and magnetic field vector $\\vec{B}$ oriented relative to the light wavefront plane and propagation vector $\\vec{k}$ in a free light wave?',
        options: [
          'Vectors $\\vec{E}$ and $\\vec{B}$ point along the ray $\\vec{k}$ (longitudinal wave)',
          'Vectors $\\vec{E}$ and $\\vec{B}$ lie in the plane of the light wavefront, are mutually perpendicular ($\\vec{E}\\perp\\vec{B}$), and oscillate in phase, forming a right-handed triad with $\\vec{k}$',
          'Oscillations of $\\vec{E}$ and $\\vec{B}$ are shifted in phase by $\\pi/2$'
        ],
        explanation: 'Maxwell\'s equations show that light waves are strictly transverse: $\\vec{E}$ and $\\vec{B}$ always lie in the wavefront plane ($\\vec{E}\\perp\\vec{k}$, $\\vec{B}\\perp\\vec{k}$), are mutually orthogonal ($\\vec{E}\\perp\\vec{B}$), and reach their maxima and zeros simultaneously (in phase). Their cross product $\\vec{S} = \\frac{1}{\\mu_0}[\\vec{E}\\times\\vec{B}]$ gives the direction and density of light energy flux.',
        referenceLatex: String.raw`\begin{aligned}
          \vec{E}(x,t) &= \vec{E}_0\sin(kx - \omega t), \qquad \vec{B}(x,t) = \vec{B}_0\sin(kx - \omega t) \\
          \vec{S} &= \frac{1}{\mu_0}[\vec{E}\times\vec{B}], \qquad c = \frac{1}{\sqrt{\varepsilon_0\mu_0}}, \qquad \vec{E}\perp\vec{B}\perp\vec{k}
        \end{aligned}`,
        formulaLatex: String.raw`w_E = \frac{\varepsilon\varepsilon_0 E^2}{2} = w_B = \frac{B^2}{2\mu_0}, \qquad S = \frac{EB}{\mu_0} = c\cdot w_{\text{tot}}`,
        liveLatexFn: p => {
          const vPhase = 300 / p.mediumN;
          const polName = p.ellipticity < 0.08 ? '\\text{Linear}' : p.ellipticity > 0.92 ? '\\text{Circular}' : '\\text{Elliptical}';
          return String.raw`\lambda = ${p.wavelength.toFixed(1)}\text{ m}, \quad v_{\text{phase}} = ${vPhase.toFixed(0)}\text{k km/s}, \quad \text{Polarization: } ${polName}`;
        },
        sliders: [
          { label: 'Wavefront spacing λ', unit: 'm' },
          { label: 'Field amplitude E₀', unit: 'V/m' },
          { label: 'Medium refractive index n', unit: '' },
          { label: 'Polarization ellipticity ε', unit: '' }
        ]
      },
      bernoulli: {
        secTag: 'Section § 13 — Continuum Fluid Mechanics',
        shortTitle: 'Bernoulli\'s Equation (Venturi Tube)',
        subtitle: 'Relation between flow speed and static pressure in a variable-cross-section pipe',
        badge: 'Hydrodynamics',
        categoryGroupTitle: 'Part II. Fluid Statics, Hydrodynamics & MKT',
        title: 'Bernoulli\'s Equation & Venturi Effect',
        epigraph: 'In steady flow of an ideal incompressible fluid, the sum of static pressure and dynamic pressure head remains constant along any streamline.',
        figCaption: 'Fig. 13.1 — Balance between static pressure P and kinetic energy density ρv²/2',
        ekLabel: 'Dynamic ρv₂²/2',
        epLabel: 'Static Press. P₂',
        qLabel: 'Viscous Loss',
        question: 'Fluid flows horizontally through a Venturi tube from a wide section of area $S_1$ into a narrow throat of area $S_2 < S_1$. How do the flow speed $v_2$ and manometer liquid column height $h_2$ above the narrow throat change?',
        options: [
          'In the narrow throat speed decreases, while pressure and column height $h_2$ rise',
          'Flow speed in the constriction increases ($v_2 = v_1 S_1/S_2$), while static pressure and column height $h_2$ drop',
          'Flow speed increases, but static pressure $P$ remains identical in all cross-sections'
        ],
        explanation: 'By the continuity equation $S_1 v_1 = S_2 v_2$, fluid speed in the narrow throat increases inversely with cross-sectional area: $v_2 = v_1 (D_1/D_2)^2$. By energy conservation (**Bernoulli\'s equation**), an increase in dynamic pressure head $\\frac{1}{2}\\rho v_2^2$ is accompanied by a drop in static pressure: $P_2 = P_1 - \\frac{1}{2}\\rho(v_2^2 - v_1^2)$, causing the middle manometer column to drop below the outer columns.',
        referenceLatex: String.raw`\begin{aligned}
          S_1 v_1 &= S_2 v_2 = Q = \text{const} \\
          P_1 + \frac{\rho v_1^2}{2} &= P_2 + \frac{\rho v_2^2}{2} = \text{const}
        \end{aligned}`,
        formulaLatex: String.raw`v_2 = v_1 \left(\frac{D_1}{D_2}\right)^{\!2}, \qquad \Delta P = P_1 - P_2 = \frac{\rho v_1^2}{2}\!\left[\left(\frac{D_1}{D_2}\right)^{\!4} - 1\right]`,
        liveLatexFn: p => {
          const ratioSq = Math.pow(p.d1 / p.d2, 2);
          const v2 = p.v1 * ratioSq;
          const dP_kPa = 0.5 * p.rho * (v2 * v2 - p.v1 * p.v1) / 1000;
          return String.raw`v_2 = ${v2.toFixed(2)}\text{ m/s}, \quad \Delta P = P_1 - P_2 = ${dP_kPa.toFixed(2)}\text{ kPa}`;
        },
        sliders: [
          { label: 'Inlet flow speed v₁', unit: 'm/s' },
          { label: 'Wide pipe diameter D₁', unit: 'm' },
          { label: 'Throat diameter D₂', unit: 'm' },
          { label: 'Fluid density ρ', unit: 'kg/m³' }
        ]
      },
      lens: {
        secTag: 'Section § 14 — Geometrical & Wave Optics of Lenses',
        shortTitle: 'Converging Lens & Wavefront Focusing',
        subtitle: 'Transformation of a plane light wavefront into a converging spherical wavefront',
        badge: 'Light & Wavefront',
        categoryGroupTitle: 'Part III. Light Phenomena, Wavefront & Optics',
        title: 'Converging Lens & Light Wavefront Focusing',
        epigraph: 'An optical lens delays the central portion of a light wavefront more than its edges, transforming an incident plane wavefront into a spherical wavefront converging at the focus.',
        figCaption: 'Fig. 14.1 — Concentration of light energy and optical power of a thin lens D = 1/F',
        ekLabel: 'Light Flux Φ',
        epLabel: 'Optical Power D',
        qLabel: 'Reflection R',
        question: 'A parallel light beam with a plane wavefront strikes a biconvex glass lens. Why does the plane wavefront become spherical and converge to a single point (principal focus $F$) after passing through the lens?',
        options: [
          'Because light accelerates inside glass in proportion to the lens thickness',
          'The lens center is thicker than its edges, so the central portion of the wavefront travels longer at reduced speed $v = c/n$ and lags behind the edges, curving the wavefront into a converging sphere',
          'The focal length $F$ does not depend on the refractive index $n$ of the glass'
        ],
        explanation: 'By Fermat\'s principle and Huygens\' principle, the optical path length $L = n\\cdot l$ for all rays from the plane wavefront to focus $F$ is equal. Because the lens is thickest along the optical axis, the central part of the wavefront travels through glass at speed $v = c/n$ for a longer distance than peripheral rays. Consequently, the plane wavefront bends into a concave spherical surface centered at the principal focus $F = \\frac{R}{2(n-1)}$.',
        referenceLatex: String.raw`\begin{aligned}
          D &= \frac{1}{F} = (n - 1)\!\left(\frac{1}{R_1} + \frac{1}{R_2}\right) \\
          \frac{1}{d} + \frac{1}{f} &= \frac{1}{F}, \qquad \Gamma = \frac{H}{h} = \frac{f}{d}
        \end{aligned}`,
        formulaLatex: String.raw`F = \frac{R}{2(n - 1)}, \qquad D = \frac{1}{F}\text{ [dpt]}, \qquad f = \frac{d\cdot F}{d - F}`,
        liveLatexFn: p => {
          const F = p.radiusR / (2 * (p.glassN - 1));
          const D = 1 / F;
          return String.raw`n = ${p.glassN.toFixed(2)}, \quad R = ${p.radiusR.toFixed(1)}\text{ m} \implies F = ${F.toFixed(2)}\text{ m}, \quad D = ${D.toFixed(2)}\text{ dpt}`;
        },
        sliders: [
          { label: 'Lens refractive index n', unit: '' },
          { label: 'Surface curvature radius R', unit: 'm' },
          { label: 'Light beam aperture H', unit: 'm' },
          { label: 'Light wavelength λ', unit: 'nm' }
        ]
      },
      lorentz: {
        secTag: 'Section § 15 — Motion of Charges in a Magnetic Field',
        shortTitle: 'Lorentz Force: 3D Magnetic Helix',
        subtitle: 'Helical trajectory of a charged particle in a uniform magnetic field B',
        badge: 'Magnetism',
        categoryGroupTitle: 'Part IV. Electrodynamics & Magnetic Field',
        title: 'Lorentz Force & 3D Cyclotron Helix',
        epigraph: 'Because the magnetic Lorentz force is always perpendicular to a particle\'s velocity, it does no mechanical work, but curves the trajectory into a circle or 3D helix.',
        figCaption: 'Fig. 15.1 — Kinetic energy components transverse (E_⊥) and parallel (E_∥) to magnetic field B',
        ekLabel: 'Orbital E_⊥',
        epLabel: 'Longitudinal E_∥',
        qLabel: 'Work A_L = 0',
        question: 'A charged particle enters a uniform magnetic field $\\vec{B}$ at an acute pitch angle $\\alpha$ to the field lines. How do the particle\'s kinetic energy $E_k$ and trajectory shape change if the magnetic field strength $B$ is doubled?',
        options: [
          'Kinetic energy doubles and the particle flies along a straight line',
          'Kinetic energy $E_k$ remains unchanged (since $\\vec{F}_L \\perp \\vec{v}$ and work $A = 0$), while the helix radius $R$ decreases by half',
          'The particle rapidly stops due to magnetic braking'
        ],
        explanation: 'The magnetic Lorentz force $\\vec{F}_L = q[\\vec{v}\\times\\vec{B}]$ is everywhere perpendicular to velocity $\\vec{v}$, so its elementary work is zero ($dA = \\vec{F}_L\\cdot d\\vec{r} = 0$) and speed and kinetic energy $E_k = \\text{const}$ remain strictly constant. The transverse velocity component $v_\\perp = v\\sin\\alpha$ drives circular rotation of radius $R = \\frac{mv\\sin\\alpha}{|q|B}$, while the longitudinal component $v_\\parallel = v\\cos\\alpha$ carries the particle uniformly along $\\vec{B}$, tracing a 3D helix.',
        referenceLatex: String.raw`\begin{aligned}
          \vec{F}_L &= q[\vec{v}\times\vec{B}], \qquad F_L = |q| v B \sin\alpha \\
          R &= \frac{m v_\perp}{|q| B} = \frac{m v \sin\alpha}{|q| B}, \qquad T = \frac{2\pi m}{|q| B}, \qquad h = v_\parallel T
        \end{aligned}`,
        formulaLatex: String.raw`R = \frac{m v \sin\alpha}{|q| B}, \qquad h = \frac{2\pi m v \cos\alpha}{|q| B}, \qquad A_{\text{Lorentz}} = 0`,
        liveLatexFn: p => {
          const rad = (p.pitchAngle * Math.PI) / 180;
          const vPerp = p.v0 * Math.sin(rad);
          const vPar = p.v0 * Math.cos(rad);
          const R = vPerp / (p.qOverM * p.fieldB);
          const stepH = (2 * Math.PI * vPar) / (p.qOverM * p.fieldB);
          return String.raw`R = ${R.toFixed(2)}\text{ m}, \quad h_{\text{pitch}} = ${stepH.toFixed(2)}\text{ m}, \quad F_L = ${(p.qOverM * p.v0 * p.fieldB * Math.sin(rad)).toFixed(1)}\text{ N}`;
        },
        sliders: [
          { label: 'Magnetic field B', unit: 'T' },
          { label: 'Initial particle speed v₀', unit: 'm/s' },
          { label: 'Pitch angle α to B', unit: '°' },
          { label: 'Specific charge |q|/m', unit: 'C/kg' }
        ]
      },
      faraday: {
        secTag: 'Section § 16 — Electromagnetic Induction Law',
        shortTitle: 'Faraday–Lenz Electromagnetic Induction',
        subtitle: 'Generation of induced current in a coil by a moving magnet & Lenz\'s rule',
        badge: 'Induction',
        categoryGroupTitle: 'Part IV. Electrodynamics & Magnetic Field',
        title: 'Faraday\'s Law & Lenz\'s Rule in 3D',
        epigraph: 'The induced electromotive force in a closed circuit is equal and opposite in sign to the time rate of change of magnetic flux through the surface bounded by the circuit.',
        figCaption: 'Fig. 16.1 — Induced EMF ℰ_i and Joule heating power P = I²R during magnet motion',
        ekLabel: 'Mag. Flux Φ',
        epLabel: 'Induced EMF |ℰ_i|',
        qLabel: 'Joule Heat Q',
        question: 'A bar magnet is rapidly pushed North-pole first ($N$) into a closed copper solenoid. What determines the magnitude of the induced current in the coil, and how is the coil\'s induced magnetic field $\\vec{B}_{\\text{ind}}$ directed?',
        options: [
          'The current depends only on how strong a magnet rests stationary inside the coil',
          'Induced EMF is proportional to the rate of flux change $\\mathcal{E}_i = -N\\frac{d\\Phi_B}{dt}$, and by Lenz\'s rule $\\vec{B}_{\\text{ind}}$ points opposite to the magnet\'s field to oppose its approach',
          'The coil\'s induced field always pulls an approaching magnet inward'
        ],
        explanation: 'By Faraday\'s law, an induced current arises only when the magnetic flux $\\Phi_B$ through the coil turns changes over time ($d\\Phi_B/dt \\neq 0$). Higher magnet oscillation frequency $\\omega$ and turn count $N$ produce a larger induced EMF $\\mathcal{E}_i$. The minus sign expresses **Lenz\'s rule**: the induced current generates its own magnetic field $\\vec{B}_{\\text{ind}}$ that repels the approaching magnet and attracts the receding magnet.',
        referenceLatex: String.raw`\begin{aligned}
          \mathcal{E}_i &= -N \frac{d\Phi_B}{dt}, \qquad \Phi_B = B S \cos\theta \\
          I_i &= \frac{\mathcal{E}_i}{R}, \qquad F_{\text{brake}} \sim \frac{N^2 B^2 S^2 v}{R}
        \end{aligned}`,
        formulaLatex: String.raw`\mathcal{E}_i(t) = -N \frac{d\Phi_B}{dt}, \qquad I(t) = \frac{\mathcal{E}_i(t)}{R_{\text{coil}}}, \qquad P_{\text{el}} = \frac{\mathcal{E}_i^2}{R_{\text{coil}}}`,
        liveLatexFn: p => {
          const maxEmf = p.turnsN * p.magnetB * p.freq * 0.18;
          const maxI = maxEmf / p.coilR;
          return String.raw`N = ${p.turnsN}\text{ turns}, \quad |\mathcal{E}_{i,\max}| \approx ${maxEmf.toFixed(1)}\text{ V}, \quad I_{\max} = ${maxI.toFixed(2)}\text{ A}`;
        },
        sliders: [
          { label: 'Coil turn count N', unit: '' },
          { label: 'Magnet field B₀', unit: 'T' },
          { label: 'Magnet oscillation freq. ω', unit: 'rad/s' },
          { label: 'Circuit resistance R', unit: 'Ω' }
        ]
      },
      kepler: {
        secTag: 'Section § 17 — Celestial Mechanics · Kepler\'s Laws',
        shortTitle: 'Kepler\'s Laws & Gravitational Orbit',
        subtitle: 'Elliptical planetary orbit, equal-area sweep rate & orbital energy exchange',
        badge: 'Astrophysics',
        categoryGroupTitle: 'Part V. Celestial Mechanics, Oscillations & Waves',
        title: 'Elliptical Orbit & Kepler\'s Second Law',
        epigraph: 'A planet\'s radius vector sweeps out equal areas in equal times: orbital speed peaks at perihelion and drops to a minimum at aphelion.',
        figCaption: 'Fig. 17.1 — Exchange between gravitational potential energy and kinetic energy between perihelion and aphelion',
        ekLabel: 'Kinetic E_k',
        epLabel: 'Gravitational |U_g|',
        qLabel: 'Ang. Momentum L',
        question: 'A planet orbits a star along an elongated ellipse with eccentricity $e > 0$. How does the planet\'s orbital speed $v$ change as it moves from its closest approach (perihelion $r_p$) to its farthest point (aphelion $r_a$)?',
        options: [
          'The orbital speed remains constant at every point along the ellipse',
          'Speed is maximum at perihelion $v_p = v_a \\frac{1+e}{1-e}$ and decreases toward aphelion due to conservation of angular momentum $L = mvr_{\\perp}$',
          'Speed is highest at aphelion because the orbital radius is largest'
        ],
        explanation: 'Because gravity $\\vec{F}_g$ is a central force (zero torque about the star), the planet\'s angular momentum $L = m v r \\sin\\alpha$ is conserved. This yields **Kepler\'s Second Law**: the areal velocity $dS/dt = L/(2m)$ is constant. At perihelion $r_p = a(1-e)$ is smallest so speed is greatest; at aphelion $r_a = a(1+e)$ speed is lowest.',
        referenceLatex: String.raw`\begin{aligned}
          r(\theta) &= \frac{a(1 - e^2)}{1 + e\cos\theta}, \qquad \frac{dS}{dt} = \frac{L}{2m} = \text{const} \\
          v^2 &= GM\left(\frac{2}{r} - \frac{1}{a}\right), \qquad T^2 = \frac{4\pi^2}{GM}a^3
        \end{aligned}`,
        formulaLatex: String.raw`r_p = a(1 - e), \qquad r_a = a(1 + e), \qquad \frac{v_p}{v_a} = \frac{1 + e}{1 - e}`,
        liveLatexFn: p => {
          const rp = p.semiMajorA * (1 - p.eccentricity);
          const ra = p.semiMajorA * (1 + p.eccentricity);
          const ratio = (1 + p.eccentricity) / (1 - p.eccentricity);
          return String.raw`r_p = ${rp.toFixed(2)}\text{ AU}, \quad r_a = ${ra.toFixed(2)}\text{ AU}, \quad v_p / v_a = ${ratio.toFixed(2)}`;
        },
        sliders: [
          { label: 'Orbital eccentricity e', unit: '' },
          { label: 'Semi-major axis a', unit: 'AU' },
          { label: 'Central star mass M', unit: 'M☉' },
          { label: 'Planet mass m', unit: 'M⊕' }
        ]
      },
      gyroscope: {
        secTag: 'Section § 18 — Rigid Body Rotational Dynamics',
        shortTitle: 'Moment of Inertia: Rolling on an Incline',
        subtitle: 'Race between a solid cylinder and a hollow hoop rolling without slipping',
        badge: 'Rotation',
        categoryGroupTitle: 'Part V. Celestial Mechanics, Oscillations & Waves',
        title: 'Moment of Inertia & Rolling Kinetic Energy',
        epigraph: 'In rolling without slipping, potential energy splits into translational and rotational kinetic energy: the body with smaller dimensionless inertia β wins.',
        figCaption: 'Fig. 18.1 — Partition between translational E_trans = ½mv² and rotational E_rot = ½Iω² energy',
        ekLabel: 'Translational E_tr',
        epLabel: 'Potential E_p',
        qLabel: 'Rotational E_rot',
        question: 'A solid disk ($\\beta = 0.5$) and a thin-walled hoop ($\\beta = 1.0$) of equal mass and radius are released simultaneously from rest at the top of an incline and roll without slipping. Which body reaches the bottom first?',
        options: [
          'Both arrive simultaneously because they have identical mass $m$ and radius $R$',
          'The solid disk wins because its inertia factor $\\beta = 0.5$ is smaller, so a smaller fraction of energy goes into spinning it up',
          'The hoop finishes first because all of its mass is concentrated at the rim'
        ],
        explanation: 'By conservation of energy $mgh = \\frac{1}{2}mv^2 + \\frac{1}{2}I\\omega^2 = \\frac{1}{2}mv^2(1 + \\beta)$, where $\\beta = I/(mR^2)$. The linear acceleration down the slope is $a = \\frac{g\\sin\\alpha}{1 + \\beta}$. Since a solid cylinder has $\\beta = 0.5$ ($a = \\frac{2}{3}g\\sin\\alpha$) while a thin hoop has $\\beta = 1.0$ ($a = \\frac{1}{2}g\\sin\\alpha$), the solid disk always beats the hoop regardless of mass or radius!',
        referenceLatex: String.raw`\begin{aligned}
          I &= \beta m R^2, \qquad E_k = \frac{1}{2}mv^2 + \frac{1}{2}I\omega^2 = \frac{1}{2}m v^2 (1 + \beta) \\
          a &= \frac{g\sin\alpha}{1 + \beta}, \qquad \beta_{\text{sphere}} = 0.4,\; \beta_{\text{cyl}} = 0.5,\; \beta_{\text{hoop}} = 1.0
        \end{aligned}`,
        formulaLatex: String.raw`a = \frac{g\sin\alpha}{1 + \beta}, \qquad v_{\text{end}} = \sqrt{\frac{2gh}{1 + \beta}}, \qquad \frac{E_{\text{rot}}}{E_{\text{trans}}} = \beta`,
        liveLatexFn: p => {
          const rad = (p.angle * Math.PI) / 180;
          const acc = (9.81 * Math.sin(rad)) / (1 + p.betaFactor);
          const rotShare = (p.betaFactor / (1 + p.betaFactor)) * 100;
          return String.raw`\beta = ${p.betaFactor.toFixed(2)}, \quad a = ${acc.toFixed(2)}\text{ m/s}^2, \quad E_{\text{rot}}/E_k = ${rotShare.toFixed(0)}\%`;
        },
        sliders: [
          { label: 'Inertia factor β = I/(mR²)', unit: '' },
          { label: 'Incline angle α', unit: '°' },
          { label: 'Rolling body radius R', unit: 'm' },
          { label: 'Body mass m', unit: 'kg' }
        ]
      },
      standingwave: {
        secTag: 'Section § 19 — Mechanical Waves · Standing Waves & Resonance',
        shortTitle: 'Standing Wave & String Harmonics',
        subtitle: 'Normal modes of a fixed string, nodes & antinodes, and frequency vs. tension',
        badge: 'Acoustics',
        categoryGroupTitle: 'Part V. Celestial Mechanics, Oscillations & Waves',
        title: 'Standing Waves & String Overtones in 3D',
        epigraph: 'Superposition of forward and reflected waves creates a standing wave with stationary nodes and vibrating antinodes.',
        figCaption: 'Fig. 19.1 — Periodic conversion between string kinetic energy and elastic potential energy twice per cycle',
        ekLabel: 'Kinetic E_k',
        epLabel: 'Elastic E_p',
        qLabel: 'Total Energy W',
        question: 'A guitar string of length $L$ fixed at both ends is excited in its $n$-th harmonic ($n = 3$). How many antinodes form along the string, and how does the resonant frequency $f_n$ change if the string tension $T$ is quadrupled?',
        options: [
          '3 antinodes form, and the frequency $f_n$ doubles because $f_n \\propto \\sqrt{T}$',
          '1 antinode forms, and the frequency increases 4-fold',
          'The number of antinodes and frequency are independent of $n$ and tension $T$'
        ],
        explanation: 'For a string fixed at both ends, standing waves satisfy $L = n\\frac{\\lambda_n}{2}$, so the harmonic number $n$ equals the **number of antinodes** (with $n+1$ total nodes including both endpoints). Since wave speed is $v = \\sqrt{T/\\mu}$, quadrupling tension $T$ doubles the phase speed and doubles the natural frequency $f_n = \\frac{n}{2L}\\sqrt{\\frac{T}{\\mu}}$.',
        referenceLatex: String.raw`\begin{aligned}
          y(x,t) &= 2A \sin\left(\frac{n\pi x}{L}\right)\cos(\omega_n t), \qquad \lambda_n = \frac{2L}{n} \\
          v &= \sqrt{\frac{T}{\mu}}, \qquad f_n = \frac{n}{2L}\sqrt{\frac{T}{\mu}} \quad (n = 1, 2, 3, \dots)
        \end{aligned}`,
        formulaLatex: String.raw`\lambda_n = \frac{2L}{n}, \qquad v = \sqrt{\frac{T}{\mu}}, \qquad f_n = \frac{n}{2L}\sqrt{\frac{T}{\mu}}`,
        liveLatexFn: p => {
          const L = 9.6;
          const v = Math.sqrt(p.tension / (p.linearMu * 0.001));
          const lambdaN = (2 * L) / p.harmonicN;
          const fn = v / lambdaN;
          return String.raw`n = ${p.harmonicN}, \quad \lambda_${p.harmonicN} = ${lambdaN.toFixed(2)}\text{ m}, \quad f_${p.harmonicN} = ${fn.toFixed(1)}\text{ Hz}`;
        },
        sliders: [
          { label: 'Harmonic mode (antinodes) n', unit: '' },
          { label: 'String tension T', unit: 'N' },
          { label: 'Linear mass density μ', unit: 'g/m' },
          { label: 'Antinode amplitude A', unit: 'm' }
        ]
      },
      doppler: {
        secTag: 'Section § 20 — Wave Physics · Doppler Effect & Wavefronts',
        shortTitle: 'Doppler Effect & Moving Wavefront',
        subtitle: 'Compression of wavefront crests ahead of a moving source, frequency shift & Mach cone',
        badge: 'Wavefront',
        categoryGroupTitle: 'Part III. Optics, Light Wavefront & Electromagnetism',
        title: 'Doppler Effect & Wavefront Deformation',
        epigraph: 'A moving source crowds wavefront crests ahead of itself, shortening wavelength λ′ and raising the observed frequency.',
        figCaption: 'Fig. 20.1 — Comparison of forward frequency f₊ (blueshift) and rear frequency f₋ (redshift)',
        ekLabel: 'Forward freq. f₊',
        epLabel: 'Source freq. f₀',
        qLabel: 'Rear freq. f₋',
        question: 'A monochromatic wave source moves to the right at speed $v_s = 0.5 v$, where $v$ is the wavefront propagation speed in the medium. How do the crest spacing $\\lambda_+$ and observed frequency $f_+$ change for a stationary observer in front of the source?',
        options: [
          'Neither wavelength nor frequency changes because wave speed in the medium is constant',
          'Wavefronts ahead of the source are compressed by half ($\\lambda_+ = 0.5\\lambda_0$), so the observer measures twice the frequency $f_+ = 2 f_0$',
          'Wavelength ahead of the source stretches and frequency drops by half'
        ],
        explanation: 'During one emission period $T_0 = 1/f_0$, a wavefront travels $v T_0 = \\lambda_0$ while the source advances by $v_s T_0$ in the same direction. Thus the spacing between successive wavefronts ahead of the source shrinks to $\\lambda_+ = (v - v_s)T_0 = \\lambda_0(1 - M)$, raising the observed frequency to $f_+ = \\frac{f_0}{1 - M}$ (at $M = 0.5$, $f_+ = 2f_0$).',
        referenceLatex: String.raw`\begin{aligned}
          \lambda_{\text{front}} &= \lambda_0 \left(1 - \frac{v_s}{v}\right), \qquad \lambda_{\text{back}} = \lambda_0 \left(1 + \frac{v_s}{v}\right) \\
          f_+ &= \frac{f_0}{1 - M}, \qquad f_- = \frac{f_0}{1 + M}, \qquad M = \frac{v_s}{v}
        \end{aligned}`,
        formulaLatex: String.raw`f_+ = \frac{f_0}{1 - v_s/v}, \qquad f_- = \frac{f_0}{1 + v_s/v}, \qquad \sin\theta_{\text{Mach}} = \frac{v}{v_s}`,
        liveLatexFn: p => {
          const fPlus = p.machRatio < 0.98 ? (p.emitFreq / (1 - p.machRatio)).toFixed(2) : '∞';
          const fMinus = (p.emitFreq / (1 + p.machRatio)).toFixed(2);
          return String.raw`M = ${p.machRatio.toFixed(2)}, \quad f_+ = ${fPlus}\text{ Hz}, \quad f_- = ${fMinus}\text{ Hz}`;
        },
        sliders: [
          { label: 'Source Mach ratio M = v_s / v', unit: '' },
          { label: 'Wavefront speed v', unit: 'm/s' },
          { label: 'Source frequency f₀', unit: 'Hz' },
          { label: 'Wavefront crest intensity I₀', unit: 'u.' }
        ]
      },
      brewster: {
        secTag: 'Section § 21 — Transverse Light Waves · Malus\'s Law & Brewster\'s Angle',
        shortTitle: 'Polarization: Brewster\'s Angle & Malus\'s Law',
        subtitle: 'Transmission of a linearly polarized light wavefront through a polarizer and rotatable analyzer',
        badge: 'Polarization',
        categoryGroupTitle: 'Part III. Optics, Light Wavefront & Electromagnetism',
        title: 'Light Wavefront Polarization & Malus\'s Law',
        epigraph: 'Because light is a transverse wave, a crystalline analyzer transmits only the projection of E parallel to its optical axis.',
        figCaption: 'Fig. 21.1 — Transmitted intensity I = I₀ cos²θ vs. fraction blocked by the analyzer',
        ekLabel: 'Transmitted I₀cos²θ',
        epLabel: 'Input after P₁ (I₀)',
        qLabel: 'Blocked I₀sin²θ',
        question: 'A linearly polarized light beam of intensity $I_0$ strikes a second polarizer (analyzer) whose transmission axis is rotated by $\\theta = 60^\\circ$ relative to the beam\'s polarization plane. What intensity $I$ emerges from the analyzer?',
        options: [
          'The intensity is reduced by half: $I = 0.5 I_0$',
          'The electric field amplitude drops as $E = E_0\\cos 60^\\circ = 0.5 E_0$, so by Malus\'s law the intensity drops to one-fourth: $I = I_0\\cos^2 60^\\circ = 0.25 I_0$',
          'The light is completely extinguished already at $60^\\circ$'
        ],
        explanation: 'The analyzer passes only the electric field component $E = E_0 \\cos\\theta$ along its axis. Since optical intensity is proportional to the square of field amplitude ($I \\propto E^2$), we obtain **Malus\'s Law**: $I(\\theta) = I_0 \\cos^2\\theta$. At $\\theta = 60^\\circ$, $\\cos 60^\\circ = 0.5$ so $I = 0.25 I_0$, and at $\\theta = 90^\\circ$ (crossed polarizers) the wavefront is completely blocked.',
        referenceLatex: String.raw`\begin{aligned}
          E_{\text{out}} &= E_0 \cos\theta, \qquad I(\theta) = I_0 \cos^2\theta \quad (\text{Malus's Law}) \\
          \tan\theta_B &= n_{21}, \qquad \theta_B + \theta_{\text{refr}} = 90^\circ \quad (\text{Brewster's Law})
        \end{aligned}`,
        formulaLatex: String.raw`I(\theta) = I_0 \cos^2\theta, \qquad E(\theta) = E_0 |\cos\theta|, \qquad \theta_B = \arctan(n)`,
        liveLatexFn: p => {
          const rad = (p.analyzerAngle * Math.PI) / 180;
          const cosVal = Math.cos(rad);
          const iOut = p.incidentI0 * cosVal * cosVal;
          const brewster = (Math.atan(p.refractiveN) * 180) / Math.PI;
          return String.raw`\theta = ${p.analyzerAngle}^\circ, \quad I = ${iOut.toFixed(1)}\text{ W/m}^2, \quad \theta_B = ${brewster.toFixed(1)}^\circ`;
        },
        sliders: [
          { label: 'Analyzer axis angle θ', unit: '°' },
          { label: 'Polarized intensity I₀', unit: 'W/m²' },
          { label: 'Light wavelength λ', unit: 'nm' },
          { label: 'Glass refractive index n (for θ_B)', unit: '' }
        ]
      },
      diffraction: {
        secTag: 'Section § 22 — Wave Optics · Huygens–Fresnel Principle & Diffraction',
        shortTitle: 'Fraunhofer Single-Slit Diffraction',
        subtitle: 'Wavefront spreading through a narrow slit, Huygens wavelets & sinc²(β) intensity profile',
        badge: 'Diffraction',
        categoryGroupTitle: 'Part III. Optics, Light Wavefront & Electromagnetism',
        title: 'Single-Slit Wavefront Diffraction in 3D',
        epigraph: 'When a slit narrows toward the wavelength of light, the beam does not shrink—it fans out into a broad diffraction pattern.',
        figCaption: 'Fig. 22.1 — Energy distribution between the central diffraction peak and side lobes sinc²(β)',
        ekLabel: 'Central peak I(0)',
        epLabel: 'Peak width 2y₁',
        qLabel: 'Side lobes',
        question: 'A plane monochromatic light wavefront passes through a narrow vertical slit of width $b$. What happens to the width of the central bright maximum $\\Delta y_{\\text{central}}$ on the viewing screen if the slit width $b$ is **decreased**?',
        options: [
          'The central bright band on the screen narrows proportionally',
          'By the first diffraction minimum condition $\\sin\\theta_1 = \\lambda / b$, narrowing the slit increases angular divergence and **widens** the central maximum ($\\Delta y = 2\\lambda L / b$)',
          'The diffraction width depends only on the distance to the light source'
        ],
        explanation: 'By the Huygens–Fresnel principle, secondary coherent wavelets across the slit interfere destructively at angles where $b\\sin\\theta = \\pm m\\lambda$. The half-width of the central maximum is set by the first minimum ($m=1$): $y_1 \\approx \\frac{\\lambda L}{b}$. Narrowing the slit $b$ increases diffraction spreading and **broadens** the central peak $\\Delta y = \\frac{2\\lambda L}{b}$!',
        referenceLatex: String.raw`\begin{aligned}
          b \sin\theta_{\min} &= \pm m \lambda \quad (m = 1, 2, 3, \dots) \\
          I(\theta) &= I_0 \left(\frac{\sin\beta}{\beta}\right)^2, \qquad \beta = \frac{\pi b \sin\theta}{\lambda}, \qquad \Delta y_{\text{central}} = \frac{2\lambda L}{b}
        \end{aligned}`,
        formulaLatex: String.raw`b\sin\theta_m = m\lambda, \qquad \Delta y_{\text{central}} = \frac{2\lambda L}{b}, \qquad I(\theta) = I_0\left(\frac{\sin\beta}{\beta}\right)^2`,
        liveLatexFn: p => {
          const sinTheta1 = (p.wavelength * 1e-3) / p.slitWidth;
          const centralW = (2 * p.wavelength * 1e-3 * p.screenDist) / p.slitWidth;
          return String.raw`b = ${p.slitWidth.toFixed(1)}\text{ }\mu\text{m}, \quad \sin\theta_1 = ${sinTheta1.toFixed(2)}, \quad \Delta y_{\text{central}} = ${centralW.toFixed(2)}\text{ cm}`;
        },
        sliders: [
          { label: 'Diffraction slit width b', unit: 'μm' },
          { label: 'Light wavelength λ', unit: 'nm' },
          { label: 'Screen distance L', unit: 'm' },
          { label: 'Diffraction minimum order m', unit: '' }
        ]
      },
      carnot: {
        secTag: 'Section § 23 — Second Law of Thermodynamics · Carnot Cycle & Efficiency',
        shortTitle: 'Heat Engine & Carnot Cycle',
        subtitle: 'Conversion of heater heat Q₁ into mechanical piston work A and heat rejection Q₂ to the cold sink',
        badge: 'Thermodynamics',
        categoryGroupTitle: 'Part II. Hydrostatics, Aerodynamics & Thermodynamics',
        title: 'Ideal Heat Engine & Carnot Cycle in 3D',
        epigraph: 'No heat engine can convert all heat from a hot reservoir into work without rejecting heat to a colder sink: maximum efficiency is set by T₁ and T₂.',
        figCaption: 'Fig. 23.1 — Energy flow of a heat engine: Q₁ = A_useful + Q₂ and Carnot thermal efficiency η',
        ekLabel: 'Useful Work A',
        epLabel: 'Heater Input Q₁',
        qLabel: 'Rejected Heat Q₂',
        question: 'An ideal Carnot heat engine operates between a hot reservoir at $T_1 = 600\\text{ K}$ and a cold sink at $T_2 = 300\\text{ K}$, absorbing $Q_1 = 120\\text{ J}$ of heat per cycle. What is the maximum mechanical work $A$ the piston can perform in one cycle?',
        options: [
          'All $120\\text{ J}$ of heat is converted into mechanical work ($\\eta = 100\\%$)',
          'The Carnot efficiency is $\\eta = 1 - T_2/T_1 = 50\\%$, so $A = 60\\text{ J}$ becomes useful work while $Q_2 = 60\\text{ J}$ must be rejected to the cold sink',
          'The work equals the temperature difference $600 - 300 = 300\\text{ J}$'
        ],
        explanation: 'By Carnot\'s theorem, no heat engine operating between temperatures $T_1$ and $T_2$ can exceed efficiency $\\eta_{\\text{Carnot}} = 1 - \\frac{T_2}{T_1}$. For $T_1 = 600\\text{ K}$ and $T_2 = 300\\text{ K}$, $\\eta = 1 - 300/600 = 0.5$ ($50\\%$). Out of $Q_1 = 120\\text{ J}$, the piston performs $A = \\eta Q_1 = 60\\text{ J}$ of work and transfers $Q_2 = 60\\text{ J}$ to the cold reservoir.',
        referenceLatex: String.raw`\begin{aligned}
          Q_1 &= A + Q_2, \qquad \eta = \frac{A}{Q_1} = \frac{Q_1 - Q_2}{Q_1} \\
          \eta_{\text{Carnot}} &= 1 - \frac{T_2}{T_1}, \qquad A_{\max} = Q_1 \left(1 - \frac{T_2}{T_1}\right)
        \end{aligned}`,
        formulaLatex: String.raw`\eta_{\text{Carnot}} = 1 - \frac{T_2}{T_1}, \qquad A = \eta_{\text{Carnot}} Q_1, \qquad Q_2 = Q_1 - A`,
        liveLatexFn: p => {
          const eta = Math.max(0.05, 1 - p.tempCold / p.tempHot);
          const workA = p.heatQ1 * eta;
          const q2 = p.heatQ1 - workA;
          return String.raw`\eta = ${(eta * 100).toFixed(1)}\%, \quad A = ${workA.toFixed(1)}\text{ J}, \quad Q_2 = ${q2.toFixed(1)}\text{ J}`;
        },
        sliders: [
          { label: 'Hot reservoir temperature T₁', unit: 'K' },
          { label: 'Cold sink temperature T₂', unit: 'K' },
          { label: 'Heat absorbed per cycle Q₁', unit: 'J' },
          { label: 'Thermodynamic cycle freq. ν', unit: 'Hz' }
        ]
      },
      viscosity: {
        secTag: 'Section § 24 — Real Fluid Mechanics · Stokes\' Law & Terminal Velocity',
        shortTitle: 'Stokes\' Law: Terminal Velocity in a Fluid',
        subtitle: 'Sphere falling through viscous oil, Stokes drag force & approach to terminal velocity',
        badge: 'Viscosity',
        categoryGroupTitle: 'Part II. Hydrostatics, Aerodynamics & Thermodynamics',
        title: 'Motion of a Sphere in a Viscous Fluid (Stokes\' Law)',
        epigraph: 'When buoyancy plus Stokes viscous drag balances gravity, net acceleration vanishes and the sphere descends at constant terminal velocity.',
        figCaption: 'Fig. 24.1 — Conversion of potential energy into kinetic energy and viscous dissipation heat',
        ekLabel: 'Kinetic E_k',
        epLabel: 'Potential E_p',
        qLabel: 'Viscous Heat Q',
        question: 'A steel sphere of radius $r$ settles through a tall cylinder of viscous glycerin ($\\eta$). How does its steady terminal velocity $v_{\\text{term}}$ change if we use a sphere of the same material with **twice the radius** $2r$?',
        options: [
          'Terminal velocity remains unchanged because all bodies fall at the same rate',
          'Because gravity and buoyancy scale with volume $r^3$ while Stokes drag $F_c = 6\\pi\\eta r v$ scales with $r$, terminal velocity increases **4-fold** ($v_{\\text{term}} \\propto r^2 / \\eta$)',
          'The larger sphere falls slower due to greater fluid resistance'
        ],
        explanation: 'Three vertical forces act on the sphere: gravity $F_g = \\frac{4}{3}\\pi r^3 \\rho_{\\text{s}} g$ downward, buoyancy $F_A = \\frac{4}{3}\\pi r^3 \\rho_{\\text{f}} g$ upward, and Stokes viscous drag $F_c = 6\\pi\\eta r v$ upward. At terminal velocity $F_g - F_A = F_c$, giving **Stokes\' formula**: $v_{\\text{term}} = \\frac{2 r^2 g (\\rho_{\\text{s}} - \\rho_{\\text{f}})}{9\\eta}$. Thus $v_{\\text{term}}$ scales as $r^2$!',
        referenceLatex: String.raw`\begin{aligned}
          F_{\text{Stokes}} &= 6\pi \eta r v, \qquad m\frac{dv}{dt} = mg - F_A - 6\pi\eta r v \\
          v_{\text{term}} &= \frac{2 r^2 g (\rho_{\text{sphere}} - \rho_{\text{fluid}})}{9\eta}
        \end{aligned}`,
        formulaLatex: String.raw`F_c = 6\pi\eta r v, \qquad v_{\text{term}} = \frac{2 r^2 g (\rho_{\text{s}} - \rho_{\text{f}})}{9\eta}, \qquad v(t) = v_{\text{term}}\left(1 - e^{-t/\tau}\right)`,
        liveLatexFn: p => {
          const vTerm = (2 * Math.pow(p.radiusR * 0.01, 2) * 9.81 * (p.rhoSphere - p.rhoFluid)) / (9 * p.viscosityEta);
          return String.raw`r = ${p.radiusR.toFixed(2)}\text{ cm}, \quad \eta = ${p.viscosityEta.toFixed(1)}\text{ Pa}\cdot\text{s}, \quad v_{\text{term}} = ${vTerm.toFixed(3)}\text{ m/s}`;
        },
        sliders: [
          { label: 'Sphere radius r', unit: 'cm' },
          { label: 'Fluid dynamic viscosity η', unit: 'Pa·s' },
          { label: 'Sphere density ρ_sphere', unit: 'kg/m³' },
          { label: 'Viscous fluid density ρ_fluid', unit: 'kg/m³' }
        ]
      },
      coulomb: {
        secTag: 'Section § 25 — Electrostatics · Coulomb\'s Law & Field Superposition',
        shortTitle: 'Coulomb\'s Law & Electric Dipole Field',
        subtitle: '3D electric field lines of two point charges, Coulomb force & test charge motion',
        badge: 'Electrostatics',
        categoryGroupTitle: 'Part IV. Electrodynamics & Magnetic Fields',
        title: 'Coulomb\'s Law & 3D Electric Dipole Field',
        epigraph: 'Electrostatic field lines originate on positive charges and terminate on negative charges, while E at every point is the vector sum of individual fields.',
        figCaption: 'Fig. 25.1 — Work performed by the Coulomb field moving test charge q₀ along a field line',
        ekLabel: 'Kinetic E_k(q₀)',
        epLabel: 'Field Energy W_e',
        qLabel: 'Coulomb Force |F_C|',
        question: 'Two opposite point charges $+q_1$ and $-|q_2|$ are separated by distance $d$. How does the attractive Coulomb force $F_C$ between them change if the distance $d$ is halved, and which way does the electric field $\\vec{E}$ point midway between the charges?',
        options: [
          'The force doubles, and the electric field at the midpoint is zero',
          'By Coulomb\'s inverse-square law $F \\propto 1/d^2$ the force increases 4-fold, and at the midpoint $\\vec{E}_1$ and $\\vec{E}_2$ add together pointing from $+q_1$ toward $-|q_2|$',
          'The force decreases 4-fold, and the field lines form closed loops'
        ],
        explanation: 'By **Coulomb\'s Law**, electrostatic force is inversely proportional to the square of distance: $F = k\\frac{|q_1 q_2|}{d^2}$, so halving $d$ quadruples the force. At the midpoint between $+q_1$ and $-|q_2|$, both $\\vec{E}_1$ (away from $+q_1$) and $\\vec{E}_2$ (toward $-|q_2|$) point in the **same direction** (from $+$ to $-$), reinforcing each other by superposition!',
        referenceLatex: String.raw`\begin{aligned}
          F_{\text{Coulomb}} &= \frac{1}{4\pi\varepsilon_0}\frac{|q_1 q_2|}{r^2}, \qquad \vec{E}(\vec{r}) = \vec{E}_1(\vec{r}) + \vec{E}_2(\vec{r}) \\
          \varphi(\vec{r}) &= k\left(\frac{q_1}{r_1} + \frac{q_2}{r_2}\right), \qquad \vec{F}_0 = q_0 \vec{E}
        \end{aligned}`,
        formulaLatex: String.raw`F_C = k \frac{|q_1 q_2|}{d^2}, \qquad E_{\text{mid}} = \frac{4k(|q_1| + |q_2|)}{d^2}`,
        liveLatexFn: p => {
          const kScaled = 8.99;
          const force = (kScaled * Math.abs(p.q1 * p.q2)) / (p.distanceD * p.distanceD);
          const eMid = (4 * kScaled * (Math.abs(p.q1) + Math.abs(p.q2))) / (p.distanceD * p.distanceD);
          return String.raw`d = ${p.distanceD.toFixed(1)}\text{ m}, \quad F_C = ${force.toFixed(2)}\text{ mN}, \quad E_{\text{mid}} = ${eMid.toFixed(1)}\text{ kV/m}`;
        },
        sliders: [
          { label: 'Left point charge q₁ (+)', unit: 'μC' },
          { label: 'Right point charge q₂ (−)', unit: 'μC' },
          { label: 'Charge separation d', unit: 'm' },
          { label: 'Test charge q₀', unit: 'μC' }
        ]
      },
      rlccircuit: {
        secTag: 'Section § 26 — Electromagnetic Oscillations · LC / RLC Tank & Thomson\'s Formula',
        shortTitle: 'Thomson LC / RLC Oscillating Circuit',
        subtitle: 'Free electromagnetic oscillations between capacitor C and inductor coil L, Thomson period',
        badge: 'LC Circuit',
        categoryGroupTitle: 'Part IV. Electrodynamics & Magnetic Fields',
        title: 'Electromagnetic Oscillations in an LC / RLC Circuit',
        epigraph: 'In an oscillating tank circuit, electric field energy in the capacitor periodically transforms into magnetic field energy in the inductor coil.',
        figCaption: 'Fig. 26.1 — Periodic exchange between capacitor electric energy W_E = q²/(2C) and inductor magnetic energy W_B = LI²/2',
        ekLabel: 'Magnetic W_B = LI²/2',
        epLabel: 'Electric W_E = CU²/2',
        qLabel: 'Ohmic Loss Q_R',
        question: 'An ideal LC circuit consists of a capacitor $C$ and inductor $L$. Initially the capacitor is fully charged ($U = U_0$, current $I = 0$). What happens at the exact instant when the capacitor becomes completely discharged ($q = 0$)?',
        options: [
          'The current in the inductor also drops to zero and oscillations stop',
          'Due to self-induction, the current reaches its peak $I_{\\max} = U_0\\sqrt{C/L}$ and all circuit energy is stored in the inductor\'s magnetic field $W_B = \\frac{1}{2}LI_{\\max}^2$',
          'The oscillation period depends only on the initial voltage $U_0$'
        ],
        explanation: 'When the charge on the capacitor plates reaches zero ($q = 0, W_E = 0$), conservation of energy requires that all initial electric energy $\\frac{1}{2}CU_0^2$ has converted into magnetic energy $\\frac{1}{2}LI_{\\max}^2$ inside the inductor. Current is at its maximum and continues flowing by self-induction, recharging the capacitor with opposite polarity with **Thomson\'s period** $T = 2\\pi\\sqrt{LC}$.',
        referenceLatex: String.raw`\begin{aligned}
          T &= 2\pi\sqrt{LC}, \qquad \omega_0 = \frac{1}{\sqrt{LC}} \quad (\text{Thomson's Formula}) \\
          W &= W_E + W_B = \frac{q^2}{2C} + \frac{L I^2}{2}, \qquad q(t) = q_0 e^{-\gamma t}\cos(\omega t)
        \end{aligned}`,
        formulaLatex: String.raw`T = 2\pi\sqrt{LC}, \qquad W_{E,\max} = \frac{C U_0^2}{2} = \frac{L I_{\max}^2}{2}, \qquad I_{\max} = U_0\sqrt{\frac{C}{L}}`,
        liveLatexFn: p => {
          const T = 2 * Math.PI * Math.sqrt(p.inductanceL * p.capacitanceC * 0.01);
          const wMax = 0.5 * p.capacitanceC * p.voltageU0 * p.voltageU0 * 0.1;
          const iMax = p.voltageU0 * Math.sqrt(p.capacitanceC / p.inductanceL);
          return String.raw`T = ${T.toFixed(2)}\text{ s}, \quad I_{\max} = ${iMax.toFixed(2)}\text{ A}, \quad W_{\max} = ${wMax.toFixed(1)}\text{ J}`;
        },
        sliders: [
          { label: 'Coil inductance L', unit: 'H' },
          { label: 'Capacitor capacitance C', unit: 'mF' },
          { label: 'Circuit resistance R (damping)', unit: 'Ω' },
          { label: 'Initial capacitor voltage U₀', unit: 'V' }
        ]
      },
      atwood: {
        secTag: 'Section § 27 — Dynamics of Connected Bodies · Atwood\'s Machine',
        shortTitle: 'Atwood\'s Machine (Connected Masses)',
        subtitle: 'Motion of two masses on a thread over a pulley with moment of inertia, thread tension',
        badge: 'Atwood Machine',
        categoryGroupTitle: 'Part I. Classical Mechanics & Gravitation',
        title: 'Atwood\'s Machine: Dynamics of Connected Masses & Pulley Inertia',
        epigraph: 'Two weights connected by an inextensible thread over a pulley move with a single common acceleration determined by the difference in weight and total system inertia.',
        figCaption: 'Fig. 27.1 — Precision vertical Atwood stand with graduated scale, rotating pulley, and force vectors T₁, T₂, m₁g, m₂g',
        ekLabel: 'Kinetic E_k (masses + pulley)',
        epLabel: 'Potential ΔE_p = (m₁−m₂)gh',
        qLabel: 'Axle Friction Q_fr',
        question: 'On an ideal massless pulley ($m_{\\text{pulley}} = 0$), two loads $m_1 = 3\\text{ kg}$ and $m_2 = 1\\text{ kg}$ are suspended. What is the acceleration $a$ of the system and how does thread tension $T$ compare to the weights of the loads?',
        options: [
          'Acceleration $a = g$, and tension equals the heavier load $T = m_1 g$',
          'Acceleration $a = \\frac{m_1 - m_2}{m_1 + m_2}g = 0.5g$, and tension satisfies $m_2 g < T < m_1 g$ ($T = \\frac{2m_1 m_2}{m_1 + m_2}g$)',
          'Tension is zero because the two loads move in opposite directions'
        ],
        explanation: 'Writing Newton\'s second law for both loads: $m_1 g - T_1 = m_1 a$ and $T_2 - m_2 g = m_2 a$, plus the pulley torque equation $(T_1 - T_2)R = I\\varepsilon = \\frac{1}{2}m_{\\text{pulley}}R^2(a/R)$, yields $a = \\frac{(m_1 - m_2)g}{m_1 + m_2 + \\frac{1}{2}m_{\\text{pulley}}}$. For the descending heavier load $m_1$, tension is **less** than its weight ($T_1 = m_1(g - a) < m_1 g$), while for the ascending lighter load $m_2$, tension is **greater** than its weight ($T_2 = m_2(g + a) > m_2 g$).',
        referenceLatex: String.raw`\begin{aligned}
          a &= \frac{(m_1 - m_2)\,g}{m_1 + m_2 + \tfrac{1}{2}m_{\text{pulley}}}, \qquad \varepsilon = \frac{a}{R} \\
          T_1 &= m_1(g - a), \qquad T_2 = m_2(g + a), \qquad T_{\text{ideal}} = \frac{2 m_1 m_2}{m_1 + m_2}\,g
        \end{aligned}`,
        formulaLatex: String.raw`a = \frac{m_1 - m_2}{m_1 + m_2 + \tfrac{1}{2}m_{\text{pulley}}}\,g, \qquad m_2 g < T_2 \le T_1 < m_1 g`,
        liveLatexFn: p => {
          const g = 9.81;
          const mEff = p.mass1 + p.mass2 + 0.5 * p.pulleyMass;
          const a = ((p.mass1 - p.mass2) * g) / mEff;
          const t1 = p.mass1 * (g - a);
          const t2 = p.mass2 * (g + a);
          return String.raw`a = ${a.toFixed(2)}\text{ m/s}^2, \quad T_1 = ${t1.toFixed(1)}\text{ N}, \quad T_2 = ${t2.toFixed(1)}\text{ N}`;
        },
        sliders: [
          { label: 'Left load mass m₁', unit: 'kg' },
          { label: 'Right load mass m₂', unit: 'kg' },
          { label: 'Pulley mass M_p', unit: 'kg' },
          { label: 'Pulley radius R', unit: 'm' }
        ]
      },
      coriolis: {
        secTag: 'Section § 28 — Non-Inertial Reference Frames · Coriolis Force & Foucault Pendulum',
        shortTitle: 'Coriolis Force & Rotating Frame',
        subtitle: 'Trajectory deflection of a body moving on a rotating platform, inertial forces',
        badge: 'Coriolis Force',
        categoryGroupTitle: 'Part I. Classical Mechanics & Gravitation',
        title: 'Coriolis Force & Motion in a Rotating Reference Frame',
        epigraph: 'A body moving radially in an inertial frame traces a curved spiral in a rotating frame under the action of the Coriolis inertial force.',
        figCaption: 'Fig. 28.1 — Rotating platform with angular velocity ω: straight inertial trajectory vs. curved track in the rotating frame',
        ekLabel: 'Radial Kinetic ½mv_r²',
        epLabel: 'Rotational ½m(ωr)²',
        qLabel: 'Coriolis Work A_Cor = 0',
        question: 'A puck is launched radially outward from the center of a horizontal platform rotating counterclockwise ($\\vec{\\omega}$ pointing upward). In which direction is the puck deflected relative to the rotating platform?',
        options: [
          'To the right relative to its velocity vector $\\vec{v}_{\\text{rel}}$ (clockwise), since $\\vec{F}_{\\text{Cor}} = -2m[\\vec{\\omega}\\times\\vec{v}_{\\text{rel}}]$',
          'To the left in the direction of platform rotation, because the platform drags it along',
          'Strictly along the radius without any lateral deflection'
        ],
        explanation: 'In a reference frame rotating with angular velocity $\\vec{\\omega}$, any moving body experiences the **Coriolis inertial force** $\\vec{F}_{\\text{Cor}} = -2m[\\vec{\\omega}\\times\\vec{v}_{\\text{rel}}]$. By the right-hand rule, when $\\vec{\\omega}$ points upward (Northern Hemisphere / counterclockwise rotation), the Coriolis force is perpendicular to $\\vec{v}_{\\text{rel}}$ and deflects the trajectory **to the right** of the motion direction. Since $\\vec{F}_{\\text{Cor}} \\perp \\vec{v}_{\\text{rel}}$, its mechanical work is zero.',
        referenceLatex: String.raw`\begin{aligned}
          \vec{F}_{\text{Cor}} &= -2m\left[\vec{\omega}\times\vec{v}_{\text{rel}}\right], \qquad \left|\vec{F}_{\text{Cor}}\right| = 2m\,\omega\,v_{\text{rel}}\sin\alpha \\
          \vec{F}_{\text{cf}} &= m\,\omega^2\vec{r}, \qquad \Omega_{\text{Foucault}} = \omega_\oplus \sin\varphi
        \end{aligned}`,
        formulaLatex: String.raw`a_{\text{Cor}} = 2\,\omega\,v_{\text{rel}}, \qquad F_{\text{Cor}} = 2m\,\omega\,v_{\text{rel}}, \qquad \Delta s_{\perp} \approx \omega\,v_{\text{rel}}\,t^2`,
        liveLatexFn: p => {
          const aCor = 2 * p.omegaDisk * p.ballSpeed;
          const fCor = p.ballMass * aCor;
          return String.raw`a_{\text{Cor}} = 2\omega v = ${aCor.toFixed(2)}\text{ m/s}^2, \quad F_{\text{Cor}} = ${fCor.toFixed(2)}\text{ N}`;
        },
        sliders: [
          { label: 'Platform angular speed ω', unit: 'rad/s' },
          { label: 'Launch radial speed v₀', unit: 'm/s' },
          { label: 'Sphere mass m', unit: 'kg' },
          { label: 'Initial offset from center r₀', unit: 'm' }
        ]
      },
      hooke: {
        secTag: 'Section § 29 — Mechanics of Deformable Solids · Hooke\'s Law & Young\'s Modulus',
        shortTitle: 'Hooke\'s Law & Tensile Stress (Young\'s Modulus)',
        subtitle: 'Elastic uniaxial tension of a rod, mechanical stress σ, strain ε, and Poisson necking',
        badge: 'Elasticity · Young',
        categoryGroupTitle: 'Part I. Classical Mechanics & Gravitation',
        title: 'Hooke\'s Law in Differential Form & Young\'s Modulus',
        epigraph: 'Within the proportional limit, mechanical normal stress in a rod is directly proportional to its relative longitudinal elongation.',
        figCaption: 'Fig. 29.1 — Tensile testing machine with dial extensometer: rod elongation ΔL and lateral Poisson contraction under load F',
        ekLabel: 'Oscillation Kinetic E_k',
        epLabel: 'Elastic Strain Energy W_el',
        qLabel: 'Internal Damping Q',
        question: 'Two cylindrical rods of the same material (Young\'s modulus $E$) and equal initial length $L_0$ are stretched by the same force $F$. The diameter of the first rod is **twice as small** as the second ($d_1 = d_2 / 2$). How many times greater is the elongation $\\Delta L_1$ of the thinner rod?',
        options: [
          '2 times greater, because elongation is inversely proportional to diameter $d$',
          '4 times greater, because cross-sectional area $A = \\frac{\\pi d^2}{4}$ is 4 times smaller and $\\Delta L = \\frac{FL_0}{EA}$',
          'Identical, because both rods share the same Young\'s modulus $E$'
        ],
        explanation: 'By **Hooke\'s Law** for uniaxial tension, normal stress $\\sigma = \\frac{F}{A}$ is related to relative strain $\\varepsilon = \\frac{\\Delta L}{L_0}$ via Young\'s modulus: $\\sigma = E\\varepsilon$, giving $\\Delta L = \\frac{F L_0}{E A}$. Since cross-sectional area scales with the square of diameter ($A = \\frac{\\pi d^2}{4}$), halving diameter reduces $A$ by a factor of $4$, quadrupling normal stress $\\sigma$ and absolute elongation $\\Delta L$!',
        referenceLatex: String.raw`\begin{aligned}
          \sigma &= \frac{F}{A} = E\,\varepsilon, \qquad \varepsilon = \frac{\Delta L}{L_0}, \qquad \Delta L = \frac{F L_0}{E A} \\
          k_{\text{rod}} &= \frac{E A}{L_0}, \qquad W_{\text{el}} = \frac{1}{2}F\,\Delta L = \frac{\sigma^2}{2E}\,V, \qquad \varepsilon_\perp = -\nu\,\varepsilon
        \end{aligned}`,
        formulaLatex: String.raw`\sigma = \frac{F}{A}, \qquad \varepsilon = \frac{\sigma}{E} = \frac{F}{E A}, \qquad \Delta L = \frac{F L_0}{E A}`,
        liveLatexFn: p => {
          const areaMm2 = Math.PI * 0.25 * p.rodDiam * p.rodDiam;
          const sigmaMPa = (p.loadForce * 1000) / areaMm2;
          const strain = sigmaMPa / (p.youngE * 1000);
          const strainPct = strain * 100;
          const dlMm = p.rodLength * 1000 * strain;
          return String.raw`\sigma = ${sigmaMPa.toFixed(1)}\text{ MPa}, \quad \varepsilon = ${strainPct.toFixed(3)}\%, \quad \Delta L = ${dlMm.toFixed(2)}\text{ mm}`;
        },
        sliders: [
          { label: 'Tensile load force F', unit: 'kN' },
          { label: 'Young\'s modulus E', unit: '×10¹⁰ Pa' },
          { label: 'Specimen diameter d', unit: 'mm' },
          { label: 'Initial gauge length l₀', unit: 'm' }
        ]
      },
      torricelli: {
        secTag: 'Section § 30 — Hydrodynamics · Torricelli\'s Formula & Jet Efflux',
        shortTitle: 'Torricelli\'s Law (Jet Efflux from Orifice)',
        subtitle: 'Efflux speed v = √(2gh) from a vessel orifice and parabolic jet range X = 2√(h·y₀)',
        badge: 'Torricelli Law',
        categoryGroupTitle: 'Part II. Hydrostatics, Aerodynamics & Thermodynamics',
        title: 'Torricelli\'s Theorem & Hydrodynamic Efflux of a Liquid Jet',
        epigraph: 'Liquid emerging from a narrow orifice at depth h below the free surface acquires the exact speed of a body freely falling from height h.',
        figCaption: 'Fig. 30.1 — Mariotte–Torricelli vessel with side nozzles: comparison of parabolic jets and maximum range at h = H/2',
        ekLabel: 'Jet Kinetic ½ρv²',
        epLabel: 'Hydrostatic ρgh',
        qLabel: 'Nozzle Loss Q_visc',
        question: 'In a vertical vessel filled with water to total height $H$, small nozzles are placed at various depths $h$ below the free surface (so nozzle height above the table is $y_0 = H - h$). At what depth $h$ does the emerging water jet achieve the **maximum horizontal range** $X_{\\max}$ on the table?',
        options: [
          'Right at the very bottom ($h \\to H, y_0 \\to 0$), where hydrostatic pressure and efflux speed $v = \\sqrt{2gh}$ are greatest',
          'Exactly at mid-height of the liquid column ($h = H/2 = y_0$), where $X = 2\\sqrt{h(H - h)}$ reaches its maximum $X_{\\max} = H$',
          'Near the top surface ($h \\to 0$), because the jet has the longest fall time $t = \\sqrt{2y_0/g}$'
        ],
        explanation: 'By **Torricelli\'s Theorem** (derived from Bernoulli\'s equation), horizontal efflux speed at depth $h$ is $v = \\sqrt{2gh}$. Falling from nozzle height $y_0 = H - h$ takes time $t = \\sqrt{2y_0 / g}$. Thus the horizontal range is $X = v t = \\sqrt{2gh}\\cdot\\sqrt{2(H-h)/g} = 2\\sqrt{h(H - h)}$. Notice that $X$ is independent of $g$ and Liquid density, is symmetric for $h$ and $H - h$, and reaches its maximum **$X_{\\max} = H$** at **$h = H/2$**!',
        referenceLatex: String.raw`\begin{aligned}
          v &= \sqrt{2gh} \quad (\text{Torricelli's Law}), \qquad t_{\text{fall}} = \sqrt{\frac{2 y_0}{g}} \\
          X &= v\,t_{\text{fall}} = 2\sqrt{h\,y_0} = 2\sqrt{h(H - h)}, \qquad X_{\max} = H \;\text{at}\; h = \frac{H}{2}
        \end{aligned}`,
        formulaLatex: String.raw`v = \sqrt{2gh}, \qquad X(h) = 2\sqrt{h\,y_0}, \qquad Q = A_0\sqrt{2gh}`,
        liveLatexFn: p => {
          const g = 9.81;
          const h = Math.min(p.waterLevelH - 0.15, p.nozzleDepthH);
          const v = p.dischargeMu * Math.sqrt(Math.max(0, 2 * g * h));
          const rangeX = 2 * p.dischargeMu * Math.sqrt(Math.max(0, h * (p.waterLevelH - h)));
          return String.raw`h = ${h.toFixed(2)}\text{ m}, \quad v = \varphi\sqrt{2gh} = ${v.toFixed(2)}\text{ m/s}, \quad X = ${rangeX.toFixed(2)}\text{ m}`;
        },
        sliders: [
          { label: 'Water column height H', unit: 'm' },
          { label: 'Probed nozzle depth h', unit: 'm' },
          { label: 'Nozzle velocity coeff. φ', unit: '' },
          { label: 'Liquid density ρ', unit: 'g/cm³' }
        ]
      },
      maxwell: {
        secTag: 'Section § 31 — Statistical Physics · Maxwell–Boltzmann Speed Distribution',
        shortTitle: 'Maxwell Molecular Speed Distribution',
        subtitle: 'Statistical distribution f(v), most probable speed v_p, mean ⟨v⟩, and RMS speed v_rms',
        badge: 'Maxwell Law',
        categoryGroupTitle: 'Part II. Hydrostatics, Aerodynamics & Thermodynamics',
        title: 'Maxwell\'s Law of Molecular Speed Distribution in an Ideal Gas',
        epigraph: 'Chaos of individual molecular collisions gives rise to a strictly deterministic bell-shaped statistical curve of speed probabilities.',
        figCaption: 'Fig. 31.1 — Thermal gas chamber and live 3D histogram of Maxwell speed distribution f(v) with characteristic speeds v_p < ⟨v⟩ < v_rms',
        ekLabel: 'Mean Thermal ⟨E_k⟩ = 3/2 kT',
        epLabel: 'High-Energy Tail (v > v_thr)',
        qLabel: 'Entropy Factor S',
        question: 'How does the Maxwell speed distribution curve $f(v)$ change when the absolute temperature $T$ of the gas is increased at constant molar mass $M$?',
        options: [
          'The peak shifts toward higher speeds ($v_p \\propto \\sqrt{T}$), the curve broadens, and the peak height $f(v_p)$ decreases so total area remains $1$',
          'The curve grows taller at the same speed $v_p$ without changing width',
          'All molecules acquire the exact same speed $v_{\\text{rms}}$'
        ],
        explanation: 'In **Maxwell\'s distribution** $f(v) = 4\\pi\\left(\\frac{M}{2\\pi RT}\\right)^{3/2} v^2 e^{-\\frac{Mv^2}{2RT}}$, all three characteristic speeds scale as $\\sqrt{T/M}$: most probable $v_p = \\sqrt{2RT/M}$, mean $\\langle v\\rangle = \\sqrt{8RT/(\\pi M)}$, and root-mean-square $v_{\\text{rms}} = \\sqrt{3RT/M}$. Since the normalization integral $\\int_0^\\infty f(v)\\,dv = 1$ is conserved, shifting the peak to higher speeds ($v_p \\propto \\sqrt{T}$) causes the curve to **broaden and lower its peak height** ($f(v_p) \\propto 1/v_p$), while exponentially increasing the fraction of fast molecules in the high-energy tail!',
        referenceLatex: String.raw`\begin{aligned}
          f(v) &= 4\pi\left(\frac{M}{2\pi R T}\right)^{3/2} v^2 \exp\!\left(-\frac{M v^2}{2 R T}\right) \\
          v_p &= \sqrt{\frac{2RT}{M}} \;<\; \langle v\rangle = \sqrt{\frac{8RT}{\pi M}} \;<\; v_{\text{rms}} = \sqrt{\frac{3RT}{M}}
        \end{aligned}`,
        formulaLatex: String.raw`v_p : \langle v\rangle : v_{\text{rms}} = \sqrt{2} : \sqrt{\frac{8}{\pi}} : \sqrt{3} \approx 1 : 1.128 : 1.225`,
        liveLatexFn: p => {
          const R = 8.314;
          const mKg = p.molarMassM * 0.001;
          const vp = Math.sqrt((2 * R * p.gasTempT) / mKg);
          const vAvg = Math.sqrt((8 * R * p.gasTempT) / (Math.PI * mKg));
          const vRms = Math.sqrt((3 * R * p.gasTempT) / mKg);
          return String.raw`v_p = ${vp.toFixed(0)}\text{ m/s}, \quad \langle v\rangle = ${vAvg.toFixed(0)}\text{ m/s}, \quad v_{\text{rms}} = ${vRms.toFixed(0)}\text{ m/s}`;
        },
        sliders: [
          { label: 'Gas temperature T', unit: 'K' },
          { label: 'Gas molar mass M (4=He, 28=N₂, 44=CO₂)', unit: 'g/mol' },
          { label: 'Visualized molecules N', unit: 'pcs' },
          { label: 'Activation threshold v_thr / v_p', unit: '' }
        ]
      },
      newtonrings: {
        secTag: 'Section § 32 — Wave Optics · Newton\'s Rings & Thin-Film Interference',
        shortTitle: 'Newton\'s Rings (Equal-Thickness Fringes)',
        subtitle: 'Concentric interference rings in the air wedge between a plano-convex lens and flat glass plate',
        badge: 'Newton\'s Rings',
        categoryGroupTitle: 'Part III. Wave & Quantum Optics',
        title: 'Newton\'s Rings: Interference in a Thin Air Wedge & Half-Wave Phase Shift',
        epigraph: 'Equal-thickness interference fringes map out sub-micron air gap contours with half-wavelength precision.',
        figCaption: 'Fig. 32.1 — Plano-convex lens of radius R on a flat optical glass plate: central dark spot and concentric Newton\'s rings',
        ekLabel: 'Reflected Wave I₁',
        epLabel: 'Interfering Wave I₂',
        qLabel: 'Transmitted Flux I_trans',
        question: 'Why is a **dark spot** (interference minimum) always observed at the central point of contact ($d = 0$) when viewing Newton\'s rings in **reflected** light?',
        options: [
          'Because light is completely absorbed by the glass at the contact point',
          'Because reflection from the optically denser lower plate introduces a phase shift of $\\pi$ (an extra half-wavelength $\\lambda/2$ optical path difference)',
          'Because the lens acts as a diverging mirror at the center'
        ],
        explanation: 'Interference occurs between waves reflected from the **upper** boundary of the air gap (glass $\\to$ air, no phase change) and the **lower** boundary (air $\\to$ glass plate, reflection from an optically denser medium with phase shift $\\Delta\\varphi = \\pi$, equivalent to $\\lambda/2$). Thus the optical path difference is $\\Delta = 2nd + \\lambda/2$. At the center of contact ($d = 0$), $\\Delta = \\lambda/2$, yielding destructive interference (**central dark spot**)! The radii of dark rings in reflected light are $r_m = \\sqrt{m\\lambda R / n}$.',
        referenceLatex: String.raw`\begin{aligned}
          d(r) &\approx \frac{r^2}{2R}, \qquad \Delta = 2 n\,d(r) + \frac{\lambda}{2} \\
          r_{m,\text{dark}} &= \sqrt{\frac{m\,\lambda\,R}{n}}, \qquad r_{m,\text{bright}} = \sqrt{\frac{(m - \tfrac{1}{2})\,\lambda\,R}{n}}
        \end{aligned}`,
        formulaLatex: String.raw`r_{m,\text{dark}} = \sqrt{\frac{m\,\lambda\,R}{n}}, \qquad d_m = \frac{m\,\lambda}{2n}`,
        liveLatexFn: p => {
          const rDarkMm = Math.sqrt((p.ringOrderM * (p.lambdaNm * 1e-6) * (p.lensRadiusR * 1000)) / p.gapIndexN);
          const rBrightMm = Math.sqrt(((p.ringOrderM - 0.5) * (p.lambdaNm * 1e-6) * (p.lensRadiusR * 1000)) / p.gapIndexN);
          const dUm = (p.ringOrderM * p.lambdaNm * 0.001) / (2 * p.gapIndexN);
          return String.raw`m = ${p.ringOrderM}, \quad r_{\text{dark}} = ${rDarkMm.toFixed(2)}\text{ mm}, \quad r_{\text{bright}} = ${rBrightMm.toFixed(2)}\text{ mm}, \quad d_m = ${dUm.toFixed(2)}\;\mu\text{m}`;
        },
        sliders: [
          { label: 'Wavelength λ', unit: 'nm' },
          { label: 'Lens curvature radius R', unit: 'm' },
          { label: 'Gap refractive index n', unit: '' },
          { label: 'Measured ring order m', unit: '' }
        ]
      },
      photoelectric: {
        secTag: 'Section § 33 — Quantum Optics · Photoelectric Effect & Einstein\'s Equation',
        shortTitle: 'Photoelectric Effect & Einstein\'s Law',
        subtitle: 'Quantum emission of photoelectrons, work function A_w, red limit λ_max, and stopping voltage U_stop',
        badge: 'Photoeffect · hν',
        categoryGroupTitle: 'Part III. Wave & Quantum Optics',
        title: 'External Photoelectric Effect: Einstein\'s Equation & Stopping Potential',
        epigraph: 'Light is absorbed in discrete quanta hν: the maximum kinetic energy of photoelectrons depends solely on light frequency and cathode work function.',
        figCaption: 'Fig. 33.1 — Vacuum photocell with illuminated cathode K, collector anode A, retarding field, and microammeter',
        ekLabel: 'Photoelectron E_k,max',
        epLabel: 'Work Function A_w',
        qLabel: 'Retarding Barrier eU_ret',
        question: 'According to **Einstein\'s photoelectric equation** $h\\nu = A_{\\text{w}} + E_{k,\\max}$, how does doubling the light intensity $I$ (at constant wavelength $\\lambda < \\lambda_{\\max}$) affect the maximum kinetic energy $E_{k,\\max}$ of emitted photoelectrons and saturation photocurrent $I_{\\text{sat}}$?',
        options: [
          '$E_{k,\\max}$ and stopping voltage $U_{\\text{stop}}$ remain unchanged (determined only by photon energy $h\\nu = hc/\\lambda$), while saturation photocurrent $I_{\\text{sat}}$ doubles',
          'Maximum kinetic energy $E_{k,\\max}$ doubles, while photocurrent remains unchanged',
          'The red photoelectric threshold $\\lambda_{\\max}$ shifts toward longer wavelengths'
        ],
        explanation: 'Each individual photon carries energy $E_{\\gamma} = h\\nu = \\frac{hc}{\\lambda} \\approx \\frac{1240\\text{ eV}\\cdot\\text{nm}}{\\lambda}$. An electron absorbs a single photon and spends the **work function** $A_{\\text{w}}$ to escape the metal, leaving maximum kinetic energy $E_{k,\\max} = eU_{\\text{stop}} = \\frac{hc}{\\lambda} - A_{\\text{w}}$. Increasing light intensity $I$ increases the **number of photons per second** (increasing saturation current $I_{\\text{sat}}$), but does not change the energy of each photon $h\\nu$!',
        referenceLatex: String.raw`\begin{aligned}
          h\nu &= \frac{hc}{\lambda} = A_{\text{w}} + E_{k,\max}, \qquad E_{k,\max} = \frac{m v_{\max}^2}{2} = e U_{\text{stop}} \\
          \nu_{\min} &= \frac{A_{\text{w}}}{h}, \qquad \lambda_{\max} = \frac{hc}{A_{\text{w}}} \approx \frac{1240\text{ eV}\cdot\text{nm}}{A_{\text{w}}}
        \end{aligned}`,
        formulaLatex: String.raw`E_\gamma = \frac{1240}{\lambda}\text{ eV}, \qquad E_{k,\max} = E_\gamma - A_{\text{w}}, \qquad U_{\text{stop}} = \frac{E_{k,\max}}{e}`,
        liveLatexFn: p => {
          const ePhoton = 1240 / p.wavelengthNm;
          const ekMax = Math.max(0, ePhoton - p.workFuncEv);
          const lambdaMax = 1240 / p.workFuncEv;
          return String.raw`h\nu = ${ePhoton.toFixed(2)}\text{ eV}, \quad E_{k,\max} = ${ekMax.toFixed(2)}\text{ eV}, \quad \lambda_{\max} = ${lambdaMax.toFixed(0)}\text{ nm}`;
        },
        sliders: [
          { label: 'Incident wavelength λ', unit: 'nm' },
          { label: 'Cathode work function A_w (Cs=1.9, K=2.2, Zn=4.3)', unit: 'eV' },
          { label: 'Photon flux intensity Φ', unit: 'W/m²' },
          { label: 'Retarding voltage U_ret', unit: 'V' }
        ]
      },
      rutherford: {
        secTag: 'Section § 34 — Atomic & Nuclear Physics · Rutherford Scattering of α-Particles',
        shortTitle: 'Rutherford α-Particle Scattering',
        subtitle: 'Hyperbolic trajectories in the Coulomb field of a heavy nucleus, impact parameter b, and scattering angle θ',
        badge: 'Rutherford · α',
        categoryGroupTitle: 'Part III. Wave & Quantum Optics',
        title: 'Rutherford\'s Gold Foil Experiment & Planetary Model of the Atom',
        epigraph: 'The backscattering of fast alpha particles from a thin gold foil revealed that the entire positive charge and mass of the atom are concentrated in a tiny nucleus.',
        figCaption: 'Fig. 34.1 — Beam of α-particles with various impact parameters b scattering along hyperbolas in the repulsive Coulomb field of nucleus +Ze',
        ekLabel: 'Kinetic Energy E_α',
        epLabel: 'Coulomb Barrier U(r)',
        qLabel: 'Nuclear Recoil',
        question: 'How does the scattering angle $\\theta$ of an $\\alpha$-particle depend on its **impact parameter** $b$ (the perpendicular distance from the initial velocity line to the center of the target nucleus $+Ze$)?',
        options: [
          'As impact parameter $b$ decreases ($b \\to 0$), Coulomb repulsion grows stronger and scattering angle increases up to head-on backscattering ($\\theta \\to 180^\\circ$)',
          'All $\\alpha$-particles scatter by the exact same small angle $< 1^\\circ$ regardless of $b$',
          'Scattering angle $\\theta$ is larger for higher kinetic energy $E_\\alpha$ at fixed $b$'
        ],
        explanation: 'An $\\alpha$-particle ($q_\\alpha = +2e$) moving in the repulsive Coulomb field of a heavy nucleus ($Q = +Ze$) follows a **hyperbola** governed by Rutherford\'s relation $\\cot(\\theta/2) = \\frac{2b}{r_{\\min}}$, where $r_{\\min} = \\frac{2Ze^2}{4\\pi\\varepsilon_0 E_\\alpha}$ is the closest approach distance in a head-on collision ($b = 0$). When $b$ is large, the particle passes far from the nucleus ($\\theta \\approx 0^\\circ$); when $b < r_{\\min}/2$, the particle is deflected by large obtuse angles ($\\theta > 90^\\circ$).',
        referenceLatex: String.raw`\begin{aligned}
          \cot\frac{\theta}{2} &= \frac{4\pi\varepsilon_0 E_\alpha}{Z e^2}\,b = \frac{2b}{r_{\min}}, \qquad r_{\min} = \frac{1}{4\pi\varepsilon_0}\frac{2 Z e^2}{E_\alpha} \\
          \frac{d\sigma}{d\Omega} &= \left(\frac{Z e^2}{8\pi\varepsilon_0 E_\alpha}\right)^2 \frac{1}{\sin^4(\theta/2)}
        \end{aligned}`,
        formulaLatex: String.raw`\theta = 2\arctan\!\left(\frac{r_{\min}}{2b}\right), \qquad r_{\min} \approx \frac{2.88\,Z}{E_\alpha\,[\text{MeV}]}\text{ fm}`,
        liveLatexFn: p => {
          const rMinFm = (2 * p.nuclearZ * 1.44) / p.alphaEnergyMev;
          const thetaDeg = 2 * Math.atan(rMinFm / (2 * p.impactParamB)) * (180 / Math.PI);
          return String.raw`b = ${p.impactParamB.toFixed(0)}\text{ fm}, \quad r_{\min} = ${rMinFm.toFixed(1)}\text{ fm}, \quad \theta = ${thetaDeg.toFixed(1)}^\circ`;
        },
        sliders: [
          { label: 'Impact parameter b', unit: 'fm' },
          { label: 'α-particle kinetic energy E_α', unit: 'MeV' },
          { label: 'Target nuclear charge Z', unit: 'e' },
          { label: 'Beam spread width', unit: '×' }
        ]
      },
      ampere: {
        secTag: 'Section § 35 — Electrodynamics · Ampère\'s Force Law Between Parallel Currents',
        shortTitle: 'Ampère\'s Law (Parallel Currents)',
        subtitle: 'Magnetic interaction of two parallel conductors carrying currents I₁ and I₂, attraction vs. repulsion',
        badge: 'Ampère Force',
        categoryGroupTitle: 'Part IV. Electrodynamics & Magnetic Fields',
        title: 'Magnetic Interaction of Parallel Currents & Definition of the Ampere',
        epigraph: 'Two parallel conductors carrying electric currents in the same direction attract each other, and when carrying currents in opposite directions, repel.',
        figCaption: 'Fig. 35.1 — Flexible vertical copper busbars carrying currents I₁, I₂, circular magnetic field lines B₁, B₂, and Ampère force vectors F₁₂, F₂₁',
        ekLabel: 'Magnetic Energy W_B',
        epLabel: 'Elastic Deflection W_el',
        qLabel: 'Joule Heating Q_J',
        question: 'Two long parallel conductors separated by distance $d$ carry currents $I_1$ and $I_2$ in the **same direction** ($\\uparrow\\uparrow$). How do the conductors interact, and how does the force per unit length $F/l$ change if both currents are doubled?',
        options: [
          'They attract each other, and the force per unit length $F/l = \\frac{\\mu_0 I_1 I_2}{2\\pi d}$ increases **4 times**',
          'They repel each other, and the force increases 2 times',
          'They do not interact magnetically unless the currents are alternating'
        ],
        explanation: 'By the **Biot–Savart Law**, current $I_1$ creates a circular magnetic field $B_1 = \\frac{\\mu_0 I_1}{2\\pi d}$ at the location of the second conductor. Current $I_2$ in this field experiences the **Ampère force** $\\vec{F}_{12} = I_2[\\vec{l}\\times\\vec{B}_1]$ of magnitude $\\frac{F}{l} = \\frac{\\mu_0 I_1 I_2}{2\\pi d}$. By the right-hand and left-hand rules, parallel currents ($\\uparrow\\uparrow$) **attract**, whereas antiparallel currents ($\\uparrow\\downarrow$) **repel**. Doubling both $I_1$ and $I_2$ multiplies the product $I_1 I_2$—and thus the force—by $4$!',
        referenceLatex: String.raw`\begin{aligned}
          B_1(d) &= \frac{\mu_0 I_1}{2\pi d}, \qquad \vec{F}_{12} = I_2\left[\vec{l}\times\vec{B}_1\right] \\
          \frac{F}{l} &= \frac{\mu_0 I_1 I_2}{2\pi d}, \qquad \frac{\mu_0}{2\pi} = 2\times 10^{-7}\text{ N/A}^2
        \end{aligned}`,
        formulaLatex: String.raw`\frac{F}{l} = \frac{\mu_0 I_1 I_2}{2\pi d}, \qquad B_1 = \frac{\mu_0 I_1}{2\pi d}`,
        liveLatexFn: p => {
          const b1MicroT = (20 * Math.abs(p.current1)) / p.wireDistD;
          const fPerM = (0.02 * p.current1 * p.current2) / p.wireDistD;
          const modeStr = p.directionSign > 0 ? '\\text{Attraction } (\\uparrow\\uparrow)' : '\\text{Repulsion } (\\uparrow\\downarrow)';
          return String.raw`B_1 = ${b1MicroT.toFixed(1)}\;\mu\text{T}, \quad \frac{F}{l} = ${fPerM.toFixed(2)}\text{ mN/m}, \quad ${modeStr}`;
        },
        sliders: [
          { label: 'Left busbar current I₁', unit: 'A' },
          { label: 'Right busbar current I₂', unit: 'A' },
          { label: 'Conductor separation d', unit: 'cm' },
          { label: 'Mode (+1 parallel ↑↑, −1 antiparallel ↑↓)', unit: '' }
        ]
      },
      hall: {
        secTag: 'Section § 36 — Solid-State Electrodynamics · The Hall Effect in Semiconductors',
        shortTitle: 'Hall Effect & Transverse Voltage U_H',
        subtitle: 'Lorentz deflection of charge carriers in a slab with current I in magnetic field B, n-type vs. p-type',
        badge: 'Hall Effect',
        categoryGroupTitle: 'Part IV. Electrodynamics & Magnetic Fields',
        title: 'The Hall Effect: Transverse Potential Difference & Carrier Sign Determination',
        epigraph: 'Balancing the magnetic Lorentz force with the transverse electrostatic field of accumulated edge charges reveals both the concentration and sign of charge carriers.',
        figCaption: 'Fig. 36.1 — Semiconductor Hall sensor wafer between magnet poles N–S: drift velocity v_d, Lorentz force F_L, and transverse Hall field E_H',
        ekLabel: 'Transverse Hall Energy W_H',
        epLabel: 'Carrier Drift Energy E_dr',
        qLabel: 'Ohmic Dissipation Q',
        question: 'Why does measuring the polarity of the **Hall voltage** $U_H$ between the side faces of a conductor in a magnetic field allow us to distinguish an **n-type** semiconductor (electrons $-e$) from a **p-type** semiconductor (holes $+e$) at the exact same conventional current direction $\\vec{I}$?',
        options: [
          'Because electrons and holes are deflected by the Lorentz force $\\vec{F}_L = q[\\vec{v}_d\\times\\vec{B}]$ toward **the same side face**, charging that face negatively in an n-type sample and positively in a p-type sample',
          'Because magnetic fields do not act on positively charged holes',
          'Because Hall voltage $U_H$ does not depend on magnetic induction $B$'
        ],
        explanation: 'For a given conventional current $\\vec{I}$, positively charged holes ($q = +e$) drift along $\\vec{I}$ ($\\vec{v}_d \\uparrow\\uparrow \\vec{I}$), whereas negatively charged electrons ($q = -e$) drift opposite to $\\vec{I}$ ($\\vec{v}_d \\uparrow\\downarrow \\vec{I}$). Since both the charge sign $q$ and drift velocity $\\vec{v}_d$ reverse simultaneously, the product $q\\vec{v}_d$ has the **same direction** in both cases! Consequently, the Lorentz force $\\vec{F}_L = q[\\vec{v}_d\\times\\vec{B}]$ pushes **both electrons and holes toward the exact same side face** of the wafer, creating opposite signs of the transverse Hall voltage $U_H = R_H \\frac{IB}{d}$ ($R_H = \\frac{1}{qn}$).',
        referenceLatex: String.raw`\begin{aligned}
          |q|\,E_H &= |q|\,v_d B \implies E_H = v_d B, \qquad I = |q|\,n\,v_d\,w\,d \\
          U_H &= E_H w = \frac{I B}{|q|\,n\,d} = R_H \frac{I B}{d}, \qquad R_H = \frac{1}{q n}
        \end{aligned}`,
        formulaLatex: String.raw`U_H = R_H \frac{I B}{d} = \frac{I B}{q n d}, \qquad E_H = v_d B`,
        liveLatexFn: p => {
          const sign = p.carrierSign < 0 ? -1 : 1;
          const uHallMv = sign * (p.currentI * p.magFieldB * 10) / (p.carrierConcN * p.slabThickD);
          const eHall = Math.abs(uHallMv) / 2.5;
          const typeStr = p.carrierSign > 0 ? '\\text{p-type } (+e)' : '\\text{n-type } (-e)';
          return String.raw`U_H = ${uHallMv >= 0 ? '+' : ''}${uHallMv.toFixed(1)}\text{ mV}, \quad E_H = ${eHall.toFixed(1)}\text{ V/m}, \quad ${typeStr}`;
        },
        sliders: [
          { label: 'Longitudinal current I', unit: 'A' },
          { label: 'Magnetic induction B', unit: 'T' },
          { label: 'Carrier concentration n', unit: '×10²² m⁻³' },
          { label: 'Wafer thickness d', unit: 'mm' },
          { label: 'Conductivity type (−1 n-type, +1 p-type)', unit: '' }
        ]
      },
      coupled: {
        secTag: 'Section § 37 — Theory of Small Oscillations · Normal Frequencies ω₁, ω₂ & Beat Phenomenon',
        shortTitle: 'Coupled Pendulums & Normal Modes (Beats)',
        subtitle: 'Periodic exchange of mechanical energy between two pendulums coupled by a spring',
        badge: 'Normal Modes',
        categoryGroupTitle: 'Part I. Classical Mechanics & Conservation Laws',
        title: 'Coupled Pendulums: Normal Modes & Energy Beats',
        epigraph: 'Any motion of a linear coupled system is a superposition of its fundamental normal modes.',
        figCaption: 'Fig. 37.1 — Phase modulation and complete energy exchange between two coupled pendulums with beat period T_b = 2π/(ω₂ − ω₁)',
        ekLabel: 'Pendulum 1 Energy E₁',
        epLabel: 'Pendulum 2 Energy E₂',
        qLabel: 'Coupling Spring Energy U_sp',
        question: 'How does the period of complete energy transfer between the two pendulums (beat period $T_{\\text{b}} = \\frac{2\\pi}{\\omega_2 - \\omega_1}$) change if the stiffness of the coupling spring $\\kappa$ is increased?',
        options: [
          'The beat period $T_{\\text{b}}$ decreases: stronger elastic coupling widens the frequency splitting $\\omega_2 - \\omega_1$, so energy transfers faster between the pendulums',
          'The beat period $T_{\\text{b}}$ increases proportionally to $\\kappa$',
          'The rate of energy exchange depends only on pendulum length $L$ and not on the spring'
        ],
        explanation: 'The symmetric (in-phase) mode oscillates at $\\omega_1 = \\sqrt{g/L}$ (spring unstretched), while the antisymmetric (out-of-phase) mode oscillates at $\\omega_2 = \\sqrt{g/L + 2\\kappa/m}$. Increasing spring stiffness $\\kappa$ increases the frequency difference $\\Delta\\omega = \\omega_2 - \\omega_1$, shortening the beat period $T_{\\text{b}} = 2\\pi / \\Delta\\omega$.',
        referenceLatex: String.raw`\begin{aligned}
          \omega_1 &= \sqrt{\frac{g}{L}}, \qquad \omega_2 = \sqrt{\frac{g}{L} + \frac{2\kappa}{m}} \\
          \Omega_{\text{b}} &= \omega_2 - \omega_1, \qquad T_{\text{b}} = \frac{2\pi}{\omega_2 - \omega_1}
        \end{aligned}`,
        formulaLatex: String.raw`x_1(t) \propto \cos\!\left(\frac{\omega_2 - \omega_1}{2}t\right)\cos(\bar{\omega}t), \qquad \Delta\omega = \omega_2 - \omega_1`,
        liveLatexFn: p => {
          const w1 = Math.sqrt(9.81 / p.pendLength);
          const w2 = Math.sqrt(9.81 / p.pendLength + (2 * p.springK) / p.bobMass);
          const tBeat = (2 * Math.PI) / Math.max(0.05, w2 - w1);
          return String.raw`\omega_1 = ${w1.toFixed(2)}\text{ s}^{-1}, \quad \omega_2 = ${w2.toFixed(2)}\text{ s}^{-1}, \quad T_{\text{b}} = ${tBeat.toFixed(2)}\text{ s}`;
        },
        sliders: [
          { label: 'Pendulum suspension length L', unit: 'm' },
          { label: 'Coupling spring stiffness κ', unit: 'N/m' },
          { label: 'Mass of each bob m', unit: 'kg' },
          { label: 'Mode (0 = beats, 1 = in-phase, −1 = anti-phase)', unit: '' }
        ]
      },
      precession: {
        secTag: 'Section § 38 — Rigid Body Dynamics · Fundamental Gyroscope Equation dL/dt = M & Precession Ω',
        shortTitle: 'Gyroscopic Precession of a Heavy Top',
        subtitle: 'Precession of spin angular momentum L around the vertical axis under gravitational torque M = [r × mg]',
        badge: 'Gyroscope',
        categoryGroupTitle: 'Part I. Classical Mechanics & Conservation Laws',
        title: 'Gyroscopic Precession of a Heavy Symmetric Top',
        epigraph: 'The axis of a rapidly spinning gyroscope moves not in the direction of the applied force, but in the direction of its torque vector.',
        figCaption: 'Fig. 38.1 — Orthogonality of gravitational torque M = [r × mg] to spin angular momentum L and the precession cone',
        ekLabel: 'Spin Kinetic Energy E_ω',
        epLabel: 'Precession Energy E_Ω',
        qLabel: 'Tilt Potential Energy U_g',
        question: 'How does the angular speed of gyroscopic precession $\\Omega_{\\text{prec}} = \\frac{mgd}{I\\omega}$ change if the flywheel is spun up to twice its initial angular velocity $\\omega$?',
        options: [
          'The precession angular speed $\\Omega_{\\text{prec}}$ is halved: a larger spin angular momentum $L = I\\omega$ makes the gyroscope axis more resistant to external torque',
          'The precession angular speed $\\Omega_{\\text{prec}}$ doubles',
          'Precession speed is independent of the flywheel spin rate $\\omega$'
        ],
        explanation: 'From the torque relation $dL = L\\sin\\theta\\,\\Omega_{\\text{prec}}\\,dt = mgd\\sin\\theta\\,dt$, we obtain $\\Omega_{\\text{prec}} = \\frac{mgd}{I\\omega}$. Thus, the larger the intrinsic spin angular momentum $L = I\\omega$, the slower the rotor axis precesses.',
        referenceLatex: String.raw`\begin{aligned}
          \frac{d\vec{L}}{dt} &= \vec{M} = [\vec{r} \times m\vec{g}], \qquad L = I\omega \\
          \Omega_{\text{prec}} &= \frac{m g d}{I \omega} = \frac{M}{L \sin\theta}
        \end{aligned}`,
        formulaLatex: String.raw`\Omega_{\text{prec}} = \frac{m g d}{I \omega}, \qquad L = I \omega, \qquad M = m g d \sin\theta`,
        liveLatexFn: p => {
          const iSpin = 0.5 * p.rotorMass * 1.15 * 1.15;
          const lSpin = iSpin * p.spinOmega;
          const omegaPrec = (p.rotorMass * 9.81 * p.pivotArmD) / Math.max(0.5, lSpin);
          return String.raw`L = ${lSpin.toFixed(1)}\text{ kg·m}^2/\text{s}, \quad \Omega_{\text{prec}} = ${omegaPrec.toFixed(2)}\text{ rad/s}`;
        },
        sliders: [
          { label: 'Rotor spin angular velocity ω', unit: 'rad/s' },
          { label: 'Gyroscope flywheel mass m', unit: 'kg' },
          { label: 'Center-of-mass lever arm d', unit: 'm' },
          { label: 'Nutation (axis tilt) angle θ', unit: '°' }
        ]
      },
      magnus: {
        secTag: 'Section § 39 — Continuum Mechanics · Kutta–Joukowski Theorem F_M = ρ v_∞ Γ & Magnus Effect',
        shortTitle: 'Magnus Effect — Aerodynamic Lift on a Spinning Body',
        subtitle: 'Transverse lift force F_M on a rotating cylinder in a uniform flow due to velocity circulation Γ',
        badge: 'Aerodynamics',
        categoryGroupTitle: 'Part I. Classical Mechanics & Conservation Laws',
        title: 'Magnus Effect & Lift Force on a Rotating Cylinder',
        epigraph: 'Rotation entrains the boundary layer, creating a velocity asymmetry and a transverse Bernoulli pressure gradient.',
        figCaption: 'Fig. 39.1 — Streamline deflection around a Flettner rotor and generation of transverse Magnus lift F_M',
        ekLabel: 'Flow Kinetic Energy E_fl',
        epLabel: 'Rotor Spin Energy E_rot',
        qLabel: 'Transverse Magnus Work',
        question: 'In which direction does the transverse Magnus force $\\vec{F}_M$ act if the airflow approaches from left to right ($+X$) and the horizontal cylinder spins so that its top surface moves with the flow?',
        options: [
          'Vertically upward ($+Y$): above the cylinder the surface speed adds to the flow speed ($v_{\\text{top}} > v_{\\text{bot}}$), so by Bernoulli\'s principle pressure is lower on top than on the bottom',
          'Vertically downward ($-Y$), because air pressure increases on top',
          'The Magnus force acts only along the flow direction and produces no lift'
        ],
        explanation: 'Where the spinning cylinder surface moves in the same direction as the oncoming stream, the resultant flow speed is higher ($v + \\omega R$), and by Bernoulli\'s equation $P + \\frac{1}{2}\\rho v^2 = \\text{const}$ the static pressure is lower. This pressure difference produces the transverse Kutta–Joukowski–Magnus lift $F_M = \\rho v_\\infty \\Gamma L$.',
        referenceLatex: String.raw`\begin{aligned}
          \Gamma &= 2\pi R^2 \omega, \qquad \Delta P = \frac{1}{2}\rho\left(v_{\text{top}}^2 - v_{\text{bot}}^2\right) \\
          F_M &= \rho v_\infty \Gamma L = 2\pi \rho R^2 L \omega v_\infty
        \end{aligned}`,
        formulaLatex: String.raw`F_M = \rho v_\infty \Gamma L = 2\pi \rho R^2 L \omega v_\infty, \qquad \Gamma = 2\pi R^2 \omega`,
        liveLatexFn: p => {
          const gamma = 2 * Math.PI * (p.cylRadius * 0.1) * (p.cylRadius * 0.1) * p.spinOmega;
          const fMagnus = p.airDensity * p.flowSpeed * gamma * 2.5;
          return String.raw`\Gamma = ${gamma.toFixed(2)}\text{ m}^2/\text{s}, \qquad F_M = ${fMagnus.toFixed(2)}\text{ N}`;
        },
        sliders: [
          { label: 'Free-stream flow velocity v_∞', unit: 'm/s' },
          { label: 'Cylinder angular velocity ω', unit: 'rad/s' },
          { label: 'Rotor radius R', unit: 'dm' },
          { label: 'Fluid density ρ', unit: 'kg/m³' }
        ]
      },
      capillary: {
        secTag: 'Section § 40 — Molecular Physics of Liquids · Young–Laplace Pressure & Jurin\'s Capillary Law',
        shortTitle: 'Surface Tension & Capillary Rise (Jurin\'s Law)',
        subtitle: 'Laplace pressure jump ΔP = 2σ cos θ / r under a concave or convex meniscus and equilibrium column height h',
        badge: 'Capillarity',
        categoryGroupTitle: 'Part II. Molecular Physics, Fluid Dynamics & Thermodynamics',
        title: 'Surface Tension, Meniscus Curvature & Capillary Action',
        epigraph: 'A narrow capillary tube makes visible the molecular cohesive forces capable of lifting a liquid column against gravity.',
        figCaption: 'Fig. 40.1 — Liquid column height h inside a capillary tube of radius r compared to a wide vessel for various contact angles θ',
        ekLabel: 'Meniscus Surface Energy W_σ',
        epLabel: 'Column Potential Energy U_g',
        qLabel: 'Wetting Adhesion Work A_w',
        question: 'What happens to the liquid level inside a narrow glass capillary if the liquid does not wet the walls (contact angle $\\theta > 90^\\circ$, e.g., mercury on glass)?',
        options: [
          'A convex meniscus forms, Laplace pressure points downward ($\\cos\\theta < 0$), and the liquid level inside the capillary drops below the reservoir level ($h < 0$)',
          'The liquid rises even higher than for complete wetting',
          'The capillary level remains equal to the wide vessel level'
        ],
        explanation: 'By Jurin\'s formula $h = \\frac{2\\sigma\\cos\\theta}{\\rho g r}$, the sign of $h$ is governed by $\\cos\\theta$. For wetting liquids ($\\theta < 90^\\circ$, $\\cos\\theta > 0$), the concave meniscus pulls the column upward ($h > 0$), whereas for non-wetting liquids ($\\theta > 90^\\circ$, $\\cos\\theta < 0$), the convex meniscus depresses the column downward ($h < 0$).',
        referenceLatex: String.raw`\begin{aligned}
          \Delta P_{\text{Lap}} &= \frac{2\sigma \cos\theta}{r} = \rho g h \\
          h &= \frac{2\sigma \cos\theta}{\rho g r}
        \end{aligned}`,
        formulaLatex: String.raw`h = \frac{2\sigma \cos\theta}{\rho g r}, \qquad \Delta P = \frac{2\sigma \cos\theta}{r}`,
        liveLatexFn: p => {
          const cosTheta = Math.cos((p.contactAngle * Math.PI) / 180);
          const hMm = (2 * p.sigmaMilli * cosTheta) / (p.fluidRho * 9.81 * p.tubeRadiusMm * 0.001) * 0.001;
          const dP = (2 * p.sigmaMilli * 0.001 * cosTheta) / (p.tubeRadiusMm * 0.001);
          return String.raw`h = ${hMm.toFixed(1)}\text{ mm}, \qquad \Delta P = ${dP.toFixed(0)}\text{ Pa} \quad (\theta = ${p.contactAngle}^\circ)`;
        },
        sliders: [
          { label: 'Surface tension coefficient σ', unit: 'mN/m' },
          { label: 'Contact wetting angle θ', unit: '°' },
          { label: 'Inner capillary radius r', unit: 'mm' },
          { label: 'Liquid density ρ', unit: 'g/cm³' }
        ]
      },
      brownian: {
        secTag: 'Section § 41 — Kinetic Theory · Einstein–Smoluchowski Diffusion Law ⟨r²⟩ = 6 D t',
        shortTitle: 'Brownian Motion & Einstein–Smoluchowski Formula',
        subtitle: 'Random walk trajectory of a suspended microparticle under molecular impacts and linear growth of mean-square displacement ⟨r²⟩ = 6Dt',
        badge: 'Statistical Physics',
        categoryGroupTitle: 'Part II. Molecular Physics, Fluid Dynamics & Thermodynamics',
        title: 'Brownian Motion & Einstein–Smoluchowski Diffusion',
        epigraph: 'The visible trembling of a Brownian grain is direct macroscopic proof of the unceasing thermal motion of invisible molecules.',
        figCaption: 'Fig. 41.1 — Perrin random-walk trajectory of a Brownian particle immersed in a thermal bath of solvent molecules',
        ekLabel: 'Mean Thermal Energy 3/2 kT',
        epLabel: 'Diffusion Coefficient D (rel.)',
        qLabel: 'Viscous Stokes Dissipation',
        question: 'How does the root-mean-square distance $\\sqrt{\\langle r^2 \\rangle}$ of a Brownian particle from its origin depend on observation time $t$ and fluid viscosity $\\eta$?',
        options: [
          'Proportional to the square root of time $\\sqrt{t}$ and inversely proportional to $\\sqrt{\\eta}$, since $\\langle r^2 \\rangle = 6Dt = \\frac{k_B T}{\\pi \\eta a}t$',
          'Grows linearly with time $t$, as in uniform rectilinear motion',
          'Remains identically zero at all times'
        ],
        explanation: 'Because molecular impacts from different directions are statistically independent, their variances add linearly: $\\langle r^2 \\rangle = 6Dt$, where the Einstein diffusion coefficient $D = \\frac{k_B T}{6\\pi\\eta a}$ increases with temperature $T$ and decreases with particle radius $a$ and viscosity $\\eta$.',
        referenceLatex: String.raw`\begin{aligned}
          D &= \frac{k_B T}{6\pi \eta a}, \qquad \langle E_k \rangle = \frac{3}{2} k_B T \\
          \langle r^2(t) \rangle &= 6 D t = \frac{k_B T}{\pi \eta a}\, t
        \end{aligned}`,
        formulaLatex: String.raw`\langle r^2 \rangle = 6 D t, \qquad D = \frac{k_B T}{6\pi \eta a}`,
        liveLatexFn: p => {
          const dVal = (1.38 * p.tempK) / (6 * Math.PI * p.viscosityEta * p.grainRadiusUm * 100);
          const rmsUm = Math.sqrt(6 * dVal * Math.max(0.2, uiState.simTime));
          return String.raw`D = ${dVal.toFixed(2)}\;\mu\text{m}^2/\text{s}, \qquad \sqrt{\langle r^2 \rangle} = ${rmsUm.toFixed(2)}\;\mu\text{m}`;
        },
        sliders: [
          { label: 'Absolute liquid temperature T', unit: 'K' },
          { label: 'Brownian particle radius a', unit: 'μm' },
          { label: 'Dynamic fluid viscosity η', unit: 'mPa·s' }
        ]
      },
      michelson: {
        secTag: 'Section § 42 — Wave Optics · Michelson Interferometer & Optical Path Difference Δ = 2 Δd',
        shortTitle: 'Michelson Interferometer — Precision Interference',
        subtitle: 'Division of a coherent laser beam by a beam splitter into two orthogonal arms L₁, L₂ and fringe shift under mirror displacement Δd',
        badge: 'Interferometry',
        categoryGroupTitle: 'Part III. Optics, Wavefronts & Quantum Physics',
        title: 'Michelson Interferometer & Phase Shift of Beams',
        epigraph: 'Displacing a mirror by merely half a wavelength of light reverses the central interference fringe from bright to dark.',
        figCaption: 'Fig. 42.1 — Optical layout of the Michelson interferometer with beam splitter BS, mirrors M₁, M₂, and concentric Haidinger rings',
        ekLabel: 'Central Fringe Intensity I_0',
        epLabel: 'Reference Arm Power I₁',
        qLabel: 'Destructive Cancellation Share',
        question: 'By what distance $\\Delta d$ must the movable mirror $M_1$ of a Michelson interferometer be translated for the interference pattern on the screen to shift by exactly one full fringe ($\\Delta m = 1$)?',
        options: [
          'By half a wavelength $\\Delta d = \\lambda / 2$, because the beam traverses the adjustable arm twice (out and back), making the optical path change $\\Delta = 2\\Delta d = \\lambda$',
          'By one full wavelength $\\Delta d = \\lambda$',
          'By two wavelengths $\\Delta d = 2\\lambda$'
        ],
        explanation: 'In the arm with movable mirror $M_1$, the light beam travels from the beam splitter to the mirror and back again. Moving the mirror by $\\Delta d$ therefore changes the round-trip optical path difference by $\\Delta = 2\\Delta d$. Shifting by one full fringe requires $2\\Delta d = \\lambda$, or $\\Delta d = \\lambda/2$.',
        referenceLatex: String.raw`\begin{aligned}
          \Delta &= 2\,\Delta d, \qquad \Delta\varphi = \frac{2\pi}{\lambda}(2\,\Delta d) \\
          I(\Delta d) &= 4 I_0 \cos^2\!\left(\frac{2\pi\,\Delta d}{\lambda}\right), \qquad \Delta m = \frac{2\,\Delta d}{\lambda}
        \end{aligned}`,
        formulaLatex: String.raw`\Delta = 2\,\Delta d = m\lambda, \qquad I = I_{\max}\cos^2\!\left(\frac{2\pi\,\Delta d}{\lambda}\right)`,
        liveLatexFn: p => {
          const deltaNm = 2 * p.mirrorShiftNm;
          const mShift = deltaNm / p.wavelengthNm;
          const iRel = Math.pow(Math.cos((Math.PI * deltaNm) / p.wavelengthNm), 2);
          return String.raw`\Delta = 2\Delta d = ${deltaNm.toFixed(0)}\text{ nm}, \quad \Delta m = ${mShift.toFixed(2)}, \quad I/I_{\max} = ${iRel.toFixed(2)}`;
        },
        sliders: [
          { label: 'Laser wavelength λ', unit: 'nm' },
          { label: 'Micrometer mirror displacement Δd', unit: 'nm' },
          { label: 'Laser beam power P₀', unit: 'mW' }
        ]
      },
      compton: {
        secTag: 'Section § 43 — Corpuscular Nature of Light · Compton Formula Δλ = (h / m_e c)(1 − cos θ)',
        shortTitle: 'Compton Scattering of X-Ray Photons on Electrons',
        subtitle: 'Elastic collision of an X-ray photon with a free electron, wavelength shift Δλ = λ_C (1 − cos θ), and recoil momentum',
        badge: 'Quantum Optics',
        categoryGroupTitle: 'Part III. Optics, Wavefronts & Quantum Physics',
        title: 'Compton Scattering & Relativistic Photon Momentum',
        epigraph: 'The billiard-like scattering of X-ray quanta proved that a photon carries not only energy hν but also linear momentum h/λ.',
        figCaption: 'Fig. 43.1 — Scattered photon λ′ at angle θ and recoil electron at angle φ conserving relativistic energy and momentum',
        ekLabel: 'Scattered Photon Energy E_γ′',
        epLabel: 'Recoil Electron Kinetic Energy K_e',
        qLabel: 'Compton Wavelength Shift Δλ (rel.)',
        question: 'At what scattering angle $\\theta$ is the Compton wavelength increase $\\Delta\\lambda = \\lambda_C(1 - \\cos\\theta)$ maximal, and what is its value?',
        options: [
          'For backscattering at $\\theta = 180^\\circ$ ($\\cos 180^\\circ = -1$): the shift is maximal and equals twice the Compton wavelength $\\Delta\\lambda_{\\max} = 2\\lambda_C \\approx 4.85\\text{ pm}$',
          'For forward scattering at $\\theta = 0^\\circ$',
          'The wavelength shift $\\Delta\\lambda$ is independent of the scattering angle $\\theta$'
        ],
        explanation: 'Since $\\Delta\\lambda = \\lambda_C(1 - \\cos\\theta)$ with $\\lambda_C = \\frac{h}{m_e c} = 2.426\\text{ pm}$, the factor $1 - \\cos\\theta$ reaches its maximum value of $2$ for head-on backscattering ($\\theta = 180^\\circ$), transferring maximum kinetic energy to the recoil electron.',
        referenceLatex: String.raw`\begin{aligned}
          \vec{p}_\gamma &= \vec{p}_{\gamma}' + \vec{p}_e, \qquad h\nu + m_e c^2 = h\nu' + E_e \\
          \Delta\lambda &= \lambda' - \lambda_0 = \lambda_C (1 - \cos\theta), \qquad \lambda_C = \frac{h}{m_e c} \approx 2.43\text{ pm}
        \end{aligned}`,
        formulaLatex: String.raw`\Delta\lambda = \lambda' - \lambda_0 = \lambda_C (1 - \cos\theta), \qquad \lambda_C = 2.426\text{ pm}`,
        liveLatexFn: p => {
          const lambdaC = 2.426;
          const dLambda = lambdaC * (1 - Math.cos((p.scatterAngleDeg * Math.PI) / 180));
          const lambdaPrime = p.lambda0Pm + dLambda;
          return String.raw`\Delta\lambda = ${dLambda.toFixed(2)}\text{ pm}, \quad \lambda' = ${lambdaPrime.toFixed(2)}\text{ pm} \quad (\theta = ${p.scatterAngleDeg}^\circ)`;
        },
        sliders: [
          { label: 'Incident X-ray wavelength λ₀', unit: 'pm' },
          { label: 'Photon scattering angle θ', unit: '°' },
          { label: 'Target collision frequency', unit: 'Hz' }
        ]
      },
      bohr: {
        secTag: 'Section § 44 — Quantum Physics of the Atom · Stationary Bohr Orbits r_n = n² a₀ & Balmer–Rydberg Formula',
        shortTitle: 'Bohr Postulates & Quantum Orbits of Hydrogen',
        subtitle: 'Quantization of angular momentum L_n = nℏ, de Broglie standing waves 2πr_n = nλ_dB, and Rydberg spectral transitions',
        badge: 'Atomic Physics',
        categoryGroupTitle: 'Part III. Optics, Wavefronts & Quantum Physics',
        title: 'Bohr Atom Model, de Broglie Standing Waves & Spectral Series',
        epigraph: 'An allowed Bohr orbit accommodates an exact integer number of electron de Broglie wavelengths, forming a non-radiating standing wave.',
        figCaption: 'Fig. 44.1 — Allowed Bohr orbits n = 1..4 with closed de Broglie standing waves and photon emission hν during quantum jump',
        ekLabel: 'Orbital Kinetic Energy K_n',
        epLabel: 'Binding Energy Magnitude |E_n|',
        qLabel: 'Transition Photon Energy ΔE = hν',
        question: 'Why, according to de Broglie\'s hypothesis, can an electron occupy only discrete Bohr orbits of radii $r_n = n^2 a_0$ with angular momentum $L_n = n\\hbar$?',
        options: [
          'Because the circumference must contain an integer number $n$ of de Broglie wavelengths ($2\\pi r_n = n \\frac{h}{p_n}$); otherwise the matter wave destructively interferes with itself',
          'Because the Coulomb force acts only at integer distances from the nucleus',
          'Because the electron speed is identical on every orbit'
        ],
        explanation: 'Substituting the de Broglie wavelength $\\lambda_{\\text{dB}} = \\frac{h}{m_e v_n}$ into the circular standing-wave condition $2\\pi r_n = n\\lambda_{\\text{dB}}$ directly yields Bohr\'s quantization rule $m_e v_n r_n = n\\frac{h}{2\\pi} = n\\hbar$. Jumping from $n_i$ to $n_f$ emits a photon of energy $h\\nu = E_{n_i} - E_{n_f}$.',
        referenceLatex: String.raw`\begin{aligned}
          m_e v_n r_n &= n\hbar \;\Longleftrightarrow\; 2\pi r_n = n\lambda_{\text{dB}}, \qquad E_n = -\frac{13.6\text{ eV}}{n^2} \\
          h\nu &= E_{n_i} - E_{n_f} = 13.6\text{ eV}\left(\frac{1}{n_f^2} - \frac{1}{n_i^2}\right)
        \end{aligned}`,
        formulaLatex: String.raw`2\pi r_n = n\lambda_{\text{dB}}, \qquad E_n = -\frac{13.6\text{ eV}}{n^2}, \qquad \Delta E = 13.6\left(\frac{1}{n_f^2} - \frac{1}{n_i^2}\right)\text{ eV}`,
        liveLatexFn: p => {
          const ni = Math.max(p.levelFinal + 1, p.levelInit);
          const nf = p.levelFinal;
          const eInit = -13.6 / (ni * ni);
          const eFinal = -13.6 / (nf * nf);
          const dE = eInit - eFinal;
          const lambdaNm = 1240 / Math.max(0.1, dE);
          return String.raw`n_i = ${ni} \to n_f = ${nf}: \quad \Delta E = ${dE.toFixed(2)}\text{ eV}, \quad \lambda = ${lambdaNm.toFixed(0)}\text{ nm}`;
        },
        sliders: [
          { label: 'Initial quantum level n_i', unit: '' },
          { label: 'Final quantum level n_f', unit: '' },
          { label: 'de Broglie standing-wave amplitude', unit: 'rel.' }
        ]
      },
      biot: {
        secTag: 'Section § 45 — Magnetic Field of Currents · Biot–Savart Law & Helmholtz Condition d = R',
        shortTitle: 'Biot–Savart Law & Helmholtz Coils',
        subtitle: 'Axial magnetic induction B(x) of circular current loops and generation of a uniform field plateau between Helmholtz coils',
        badge: 'Magnetostatics',
        categoryGroupTitle: 'Part IV. Electrodynamics & Magnetic Fields',
        title: 'Biot–Savart Law & Uniform Field of Helmholtz Coils',
        epigraph: 'Two coaxial coils separated by a distance equal to their radius transform the curved field of a single loop into a flat uniform plateau.',
        figCaption: 'Fig. 45.1 — Magnetic field lines and axial magnetic induction profile B(x) of two coaxial circular coils carrying current I',
        ekLabel: 'Magnetic Field Energy W_B',
        epLabel: 'Central Induction B(0) (rel.)',
        qLabel: 'Central Field Inhomogeneity ΔB',
        question: 'At what separation $d$ between two identical coaxial circular coils of radius $R$ carrying co-directional currents does the magnetic field near the midpoint become maximally uniform (Helmholtz condition)?',
        options: [
          'When the coil separation equals their radius ($d = R$): at this spacing the second derivative $\\frac{d^2 B_x}{dx^2}$ vanishes at the center',
          'When the separation is much larger than the radius ($d \\gg R$)',
          'When the currents in the two coils flow in opposite directions'
        ],
        explanation: 'For a single circular loop $B(x) = \\frac{\\mu_0 NIR^2}{2(R^2+x^2)^{3/2}}$, the inflection points where $\\frac{d^2B}{dx^2} = 0$ lie at $x = \\pm R/2$. Placing two identical coils at separation $d = R$ positions both inflection points at the midpoint, cancelling both first and second derivatives of $B(x)$.',
        referenceLatex: String.raw`\begin{aligned}
          d\vec{B} &= \frac{\mu_0 I}{4\pi}\frac{[d\vec{l} \times \vec{r}]}{r^3}, \qquad B_{\text{loop}}(x) = \frac{\mu_0 N I R^2}{2(R^2 + x^2)^{3/2}} \\
          B_{\text{Helm}}(0) &= \left(\frac{4}{5}\right)^{3/2}\frac{\mu_0 N I}{R} \quad (\text{at } d = R)
        \end{aligned}`,
        formulaLatex: String.raw`B(x) = \frac{\mu_0 N I R^2}{2}\left[\frac{1}{\left(R^2 + (x - d/2)^2\right)^{3/2}} + \frac{1}{\left(R^2 + (x + d/2)^2\right)^{3/2}}\right]`,
        liveLatexFn: p => {
          const rM = p.coilRadius * 0.1;
          const dM = p.coilSepRatio * rM;
          const bCenterMt = (1.2566 * p.turnsN * p.currentI * rM * rM) / Math.pow(rM * rM + (dM * dM) / 4, 1.5);
          return String.raw`d / R = ${p.coilSepRatio.toFixed(2)}, \qquad B(0) = ${bCenterMt.toFixed(2)}\text{ mT}`;
        },
        sliders: [
          { label: 'Coil winding current I', unit: 'A' },
          { label: 'Coil radius R', unit: 'dm' },
          { label: 'Separation-to-radius ratio d/R (1.0 = Helmholtz)', unit: '' },
          { label: 'Turns per coil N', unit: '' }
        ]
      },
      transformer: {
        secTag: 'Section § 46 — Quasi-Stationary AC Circuits · Faraday\'s Law in a Transformer U₂ / U₁ = N₂ / N₁',
        shortTitle: 'AC Transformer & Mutual Induction on a Core',
        subtitle: 'Mutual electromagnetic induction via shared alternating magnetic flux Φ(t) in a ferromagnetic core and turns ratio U₂/U₁ = N₂/N₁',
        badge: 'AC Circuits',
        categoryGroupTitle: 'Part IV. Electrodynamics & Magnetic Fields',
        title: 'AC Transformer & Mutual Electromagnetic Induction',
        epigraph: 'An alternating magnetic flux confined within a closed iron core transfers electrical power contactlessly between circuits while scaling voltage.',
        figCaption: 'Fig. 46.1 — Laminated ferromagnetic core with alternating flux Φ(t), primary winding N₁, and secondary winding N₂',
        ekLabel: 'Instantaneous Secondary Power P₂',
        epLabel: 'Core Magnetic Flux Energy W_Φ',
        qLabel: 'Eddy Current & Hysteresis Loss',
        question: 'Why can a conventional transformer not step up or step down a steady DC voltage from a battery ($\\omega = 0$), even when its primary winding has hundreds of turns?',
        options: [
          'Because induced EMF in the secondary winding $\\mathcal{E}_2 = -N_2 \\frac{d\\Phi}{dt}$ arises only from a time-varying magnetic flux; direct current produces a constant flux ($\\frac{d\\Phi}{dt} = 0$), so $U_2 = 0$',
          'Because a ferromagnetic core cannot conduct a constant magnetic field',
          'Because under direct current $U_2$ always equals $U_1$'
        ],
        explanation: 'A transformer operates by Faraday\'s law of electromagnetic induction: each turn links the common core flux $\\Phi(t) = \\Phi_0 \\sin(\\omega t)$, inducing an EMF $e(t) = -\\frac{d\\Phi}{dt}$. Consequently, the ratio of RMS voltages equals the turns ratio $\\frac{U_2}{U_1} = \\frac{N_2}{N_1}$.',
        referenceLatex: String.raw`\begin{aligned}
          \mathcal{E}_1 &= -N_1\frac{d\Phi}{dt}, \qquad \mathcal{E}_2 = -N_2\frac{d\Phi}{dt} \\
          \frac{U_2}{U_1} &= \frac{N_2}{N_1} = k, \qquad I_1 U_1 \approx I_2 U_2
        \end{aligned}`,
        formulaLatex: String.raw`\frac{U_2}{U_1} = \frac{N_2}{N_1}, \qquad \mathcal{E}_2(t) = -N_2 \omega \Phi_0 \cos(\omega t)`,
        liveLatexFn: p => {
          const ratio = p.turnsN2 / p.turnsN1;
          const u2V = p.voltageU1 * ratio;
          const phiMaxMw = (p.voltageU1 * 10) / (4.44 * p.acFreqHz * p.turnsN1);
          const modeStr = ratio > 1.02 ? '\\text{step-up}' : (ratio < 0.98 ? '\\text{step-down}' : '\\text{isolation}');
          return String.raw`k = ${ratio.toFixed(2)} \;(${modeStr}), \quad U_2 = ${u2V.toFixed(1)}\text{ V}, \quad \Phi_0 = ${phiMaxMw.toFixed(2)}\text{ mWb}`;
        },
        sliders: [
          { label: 'Primary RMS voltage U₁', unit: 'V' },
          { label: 'Primary winding turns N₁', unit: '' },
          { label: 'Secondary winding turns N₂', unit: '' },
          { label: 'AC frequency f (scaled)', unit: 'Hz' }
        ]
      }
    };

    const TELEMETRY_LABEL_EN = {
      'v₁x': 'v₁x',
      'v₂x': 'v₂x',
      'p₁x + p₂x': 'p₁x + p₂x',
      'Втрати Q': 'Heat loss Q',
      'Швидкість v₁': 'Velocity v₁',
      'Швидкість v₂': 'Velocity v₂',
      'Імпульс p₁': 'Momentum p₁',
      'Повний імпульс P': 'Total Momentum P',
      'Прискорення a': 'Acceleration a',
      'Швидкість v': 'Velocity v',
      'mg·sin α': 'mg·sin α',
      'Тертя F_тер': 'Friction F_fric',
      'Сила тертя F_тер': 'Friction F_fric',
      'Критичний кут α_кр': 'Critical angle α_cr',
      'T (матем.)': 'T (simple)',
      'T (пружин.)': 'T (spring)',
      'Натяг T': 'Tension T',
      'Кут маятника θ': 'Pendulum angle θ',
      'Період маятника T₁': 'Pendulum period T₁',
      'Зміщення пружини x': 'Spring disp. x',
      'Період пружини T₂': 'Spring period T₂',
      'v_x (гориз.)': 'v_x (horiz.)',
      'v_y (верт.)': 'v_y (vert.)',
      'Висота H_max': 'Max height H_max',
      'Дальність L': 'Range L',
      'Координата X (дальність)': 'Range X',
      'Висота Y (макс.)': 'Height Y (max)',
      'Швидкість |v|': 'Speed |v|',
      'Дальність у вакуумі': 'Vacuum range',
      'Швидкість v₅': 'Velocity v₅',
      'Кут θ₁': 'Angle θ₁',
      'Кут θ₅': 'Angle θ₅',
      'Швидкість крайньої кулі': 'End sphere speed',
      'Кут лівої / правої': 'Left / Right angle',
      'Повний імпульс ∑p': 'Total momentum ∑p',
      'Відношення мас N_вх : N_вих': 'Ratio N_in : N_out',
      'Швидкість v = ωR': 'Speed v = ωR',
      'a_дц = ω²R': 'a_c = ω²R',
      'Потрібна F_дц': 'Required F_c',
      'Гранична F_тер': 'Max friction F_f',
      'Лінійна швидкість v': 'Linear speed v',
      'Доцентрове приск. a_дц': 'Centripetal acc. a_c',
      'Доцентрова сила F_дц': 'Centripetal force F_c',
      'Період обертання T': 'Rotation period T',
      'F_Архімеда': 'Buoyancy F_A',
      'Сила тяжіння mg': 'Gravity mg',
      'Занурено V_зан/V₀': 'Submerged V_sub/V₀',
      'Витіснено ΔV': 'Displaced ΔV',
      'Сила Архімеда F_A': 'Buoyant force F_A',
      'Сила тяжіння F_тяж': 'Gravity force F_g',
      'Частка занурення': 'Submerged fraction',
      'Підйом рівня Δh': 'Liquid rise Δh',
      'Температура T': 'Temperature T',
      'Об’єм газу V': 'Gas volume V',
      'Тиск P': 'Pressure P',
      'Швидкість v_кв': 'RMS speed v_rms',
      'Тиск газу P': 'Gas pressure P',
      'Сер.-кв. швидкість v_кв': 'RMS speed v_rms',
      'Концентрація n': 'Number density n',
      'Кількість ударів/с': 'Wall impacts/s',
      'Кут заломлення β': 'Refraction angle β',
      'Пропускання T': 'Transmission T',
      'Кут падіння θ₁': 'Incidence angle θ₁',
      'Кут заломлення θ₂': 'Refraction angle θ₂',
      'Швидкість фронту v₂': 'Wavefront speed v₂',
      'Довжина хвилі λ₂': 'Wavelength λ₂',
      'Крок смуг Δz': 'Fringe spacing Δz',
      'Максимумів на екрані': 'Screen maxima',
      'Інтенсивність I(P)': 'Intensity I(P)',
      'Довжина хвилі λ': 'Wavelength λ',
      'Крок смуг Δy': 'Fringe spacing Δy',
      'Число смуг на екрані': 'Visible fringes',
      'Умова максимуму': 'Maxima condition',
      'n(черв, 680 нм)': 'n(red, 680 nm)',
      'n(фіол, 405 нм)': 'n(viol, 405 nm)',
      'Кутова ширина Δδ': 'Angular spread Δδ',
      'Швидкість v_фіол': 'Violet speed v_viol',
      'Показник n (червоний)': 'Index n (red)',
      'Показник n (фіолет.)': 'Index n (violet)',
      'Кутова дисперсія Δδ': 'Angular dispersion Δδ',
      'Середнє відхилення δ': 'Mean deviation δ',
      'Поляризація': 'Polarization',
      'Фазова швидкість v': 'Phase velocity v',
      'Вектор Пойнтінга S': 'Poynting vector S',
      'Хвильове число k': 'Wave number k',
      'Циклічна частота ω': 'Angular freq. ω',
      'Потік Пойнтінга |S|': 'Poynting flux |S|',
      'Поляризація хвилі': 'Polarization',
      'Швидкість у горловині v₂': 'Throat velocity v₂',
      'Динамічний тиск ½ρv₂²': 'Dynamic press. ½ρv₂²',
      'Падіння тиску Δp = p₁−p₂': 'Pressure drop Δp = p₁−p₂',
      'Перепад тиску ΔP': 'Pressure drop ΔP',
      'Статичний тиск P₂': 'Static pressure P₂',
      'Відношення площ A₁/A₂': 'Area ratio A₁/A₂',
      'Фокусна відстань f': 'Focal length f',
      'Оптична сила лінзи D': 'Optical power D',
      'Оптична сила D': 'Optical power D',
      'Показник заломлення n': 'Refractive index n',
      'Кут збіжності 2θ': 'Convergence angle 2θ',
      'Фазова швидкість у склі': 'Speed in glass v',
      'Затримка фронту в центрі': 'Center phase delay',
      'Радіус спіралі R': 'Helix radius R',
      'Крок гвинта h': 'Helix pitch h',
      'Циклотронна частота ω_c': 'Cyclotron freq. ω_c',
      'Робота сили Лоренца A': 'Lorentz work A',
      'Ларморів радіус R_L': 'Larmor radius R_L',
      'Сила Лоренца F_L': 'Lorentz force F_L',
      'Циклотронний період T': 'Cyclotron period T',
      'Крок спіралі h': 'Helix pitch h',
      'ЕРС індукції |ℰᵢ|': 'Induced EMF |ℰᵢ|',
      'Магнітний потік Φ_B': 'Magnetic flux Φ_B',
      'Швидкість магніту v': 'Magnet velocity v',
      'Правило Ленца': 'Lenz\'s Rule',
      'Радіус-вектор r': 'Radius vector r',
      'Орбітальна швидкість v': 'Orbital speed v',
      'Сила тяжіння F_g': 'Gravity force F_g',
      'Кутова швидкість ω': 'Angular speed ω',
      'Момент інерції I': 'Moment of inertia I',
      'Довжина хвилі λ_n': 'Wavelength λ_n',
      'Власна частота f_n': 'Natural freq. f_n',
      'Швидкість хвилі v': 'Wave speed v',
      'Вузлів / Пучностей': 'Nodes / Antinodes',
      'Частота попереду f₊': 'Forward freq. f₊',
      'Частота позаду f₋': 'Rear freq. f₋',
      'Довжина хвилі попереду λ₊': 'Forward wavelength λ₊',
      'Довжина хвилі позаду λ₋': 'Rear wavelength λ₋',
      'Інтенсивність I(θ)': 'Intensity I(θ)',
      'Коефіцієнт cos²θ': 'Factor cos²θ',
      'Кут Брюстера θ_B': 'Brewster angle θ_B',
      'Стан після аналізатора': 'State after analyzer',
      'Ширина центр. піка Δy': 'Central peak width Δy',
      'Кут 1-го мінімуму θ₁': '1st minimum angle θ₁',
      'Умова мінімуму b·sin θ': 'Min condition b·sin θ',
      'Частка енергії в центрі': 'Central peak share',
      'Термічний ККД η_Карно': 'Carnot efficiency η',
      'Корисна робота A': 'Useful work A',
      'Віддано холодильнику Q₂': 'Rejected heat Q₂',
      'Такт циклу Карно': 'Carnot cycle stage',
      'Поточна швидкість v': 'Current speed v',
      'Гранична швидкість v_уст': 'Terminal speed v_term',
      'Сила Стокса F_c': 'Stokes drag F_c',
      'Режим руху кулі': 'Motion regime',
      'Сила Кулона F_C': 'Coulomb force F_C',
      'Поле в центрі E_центр': 'Midpoint field E_mid',
      'Енергія взаємодії |W|': 'Interaction energy |W|',
      'Сила на пробний заряд F₀': 'Force on test charge F₀',
      'Напруга конденсатора U(t)': 'Capacitor voltage U(t)',
      'Струм у котушці I(t)': 'Inductor current I(t)',
      'Період Томпсона T': 'Thomson period T',
      'Енергія W_E / W_B': 'Energy W_E / W_B',
      'Натяг нитки T₁ / T₂': 'Thread tension T₁ / T₂',
      'Натяг лівої нитки T₁': 'Left thread tension T₁',
      'Натяг правої нитки T₂': 'Right thread tension T₂',
      'Швидкість вантажів |v|': 'Load speed |v|',
      'Зміщення вантажів Δy': 'Load displacement Δy',
      'Сила Коріоліса F_Кор': 'Coriolis force F_Cor',
      'Прискорення a_Кор': 'Coriolis accel. a_Cor',
      'Прискорення Коріоліса a_Кор': 'Coriolis accel. a_Cor',
      'Відцентрова сила F_вдц': 'Centrifugal force F_cf',
      'Бічне зміщення дуги Δs': 'Lateral arc drift Δs',
      'Бокове знесення Δs_⊥': 'Lateral deflection Δs_⊥',
      'Механічна напруга σ': 'Mechanical stress σ',
      'Механічна напруга σ = F/S': 'Mechanical stress σ = F/A',
      'Відносна деформація ε': 'Relative strain ε',
      'Відносне видовження ε': 'Relative strain ε',
      'Абсолютне видовження ΔL': 'Elongation ΔL',
      'Абсолютне видовження Δl': 'Elongation Δl',
      'Пружна енергія W_пр': 'Elastic energy W_el',
      'Жорсткість стрижня EA/L₀': 'Rod stiffness EA/L₀',
      'Швидкість витікання v': 'Efflux speed v',
      'Швидкість Торрічеллі v': 'Torricelli speed v',
      'Дальність струменя X': 'Jet range X',
      'Дальність струменя x(h)': 'Jet range x(h)',
      'Макс. дальність x_max = H': 'Max range x_max = H',
      'Гідростатичний тиск ρgh': 'Hydrostatic press. ρgh',
      'Час польоту краплі t': 'Drop flight time t',
      'Витрата рідини Q': 'Flow rate Q',
      'Найімовірніша v_p': 'Most probable v_p',
      'Середня арифм. ⟨v⟩': 'Mean speed ⟨v⟩',
      'Сер.-квадратична v_кв': 'RMS speed v_rms',
      'Частка швидких молекул': 'Fast molecule share',
      'Радіус темного кільця r_1': 'Dark ring radius r₁',
      'Радіус темного кільця r_2': 'Dark ring radius r₂',
      'Радіус темного кільця r_3': 'Dark ring radius r₃',
      'Радіус темного кільця r_4': 'Dark ring radius r₄',
      'Радіус темного кільця r_5': 'Dark ring radius r₅',
      'Радіус темного кільця r_6': 'Dark ring radius r₆',
      'Радіус світлого кільця r_1': 'Bright ring radius r₁',
      'Радіус світлого кільця r_2': 'Bright ring radius r₂',
      'Радіус світлого кільця r_3': 'Bright ring radius r₃',
      'Радіус світлого кільця r_4': 'Bright ring radius r₄',
      'Радіус світлого кільця r_5': 'Bright ring radius r₅',
      'Радіус світлого кільця r_6': 'Bright ring radius r₆',
      'Товщина прошарку d(r_m)': 'Air gap thickness d(r_m)',
      'Зсув фази при відбитті': 'Reflection phase shift',
      'Енергія фотона hν': 'Photon energy hν',
      'Макс. кінетична E_k,max': 'Max kinetic E_k,max',
      'Затримуюча напруга U_з': 'Stopping voltage U_stop',
      'Фотострум I_ф / λ_кр': 'Photocurrent I_ph / λ_max',
      'Кут розсіяння θ': 'Scattering angle θ',
      'Прицільний параметр b': 'Impact parameter b',
      'Найближче зближення r_min': 'Closest approach r_min',
      'Заряд ядра мішені +Ze': 'Target nuclear charge +Ze',
      'Питома сила Ампера F/l': 'Force per unit length F/l',
      'Індукція поля B₁(d)': 'Field induction B₁(d)',
      'Струми I₁ / I₂': 'Currents I₁ / I₂',
      'Характер взаємодії': 'Interaction mode',
      'Напруга Холла U_H': 'Hall voltage U_H',
      'Поперечне поле E_H': 'Transverse field E_H',
      'Стала Холла |R_H|': 'Hall coefficient |R_H|',
      'Тип провідності': 'Conductivity type',
      'Синфазна частота ω₁': 'In-phase freq. ω₁',
      'Протифазна частота ω₂': 'Anti-phase freq. ω₂',
      'Період биття T_б': 'Beat period T_b',
      'Кут θ₁ / θ₂': 'Angles θ₁ / θ₂',
      'Власний момент L = Iω': 'Spin momentum L = Iω',
      'Момент сили тяжіння M': 'Gravity torque M',
      'Швидкість прецесії Ω': 'Precession rate Ω',
      'Період прецесії T_пр': 'Precession period T_p',
      'Сила Магнуса F_M': 'Magnus lift F_M',
      'Циркуляція швидкості Γ': 'Velocity circulation Γ',
      'Лінійна швидкість ωR': 'Rim speed ωR',
      'Висота Жюрена h': 'Jurin height h',
      'Лапласівський тиск ΔP': 'Laplace pressure ΔP',
      'Сила натягу F_σ': 'Surface tension F_σ',
      'Тип меніска': 'Meniscus shape',
      'Коефіцієнт дифузії D': 'Diffusion coeff. D',
      'Теоретичне √⟨r²⟩': 'Theoretical √⟨r²⟩',
      'Поточне зміщення |r(t)|': 'Displacement |r(t)|',
      'Кількість зламів траєкторії': 'Random-walk steps',
      'Оптична різниця ходу 2Δd': 'Path difference 2Δd',
      'Число зміщених смуг Δm': 'Fringe shift Δm',
      'Інтенсивність у центрі I': 'Central intensity I',
      'Стан центру картини': 'Central fringe state',
      'Зсув Комптона Δλ': 'Compton shift Δλ',
      'Розсіяна довжина λ′': 'Scattered wavelength λ′',
      'Енергія кванта E_γ′': 'Scattered photon E_γ′',
      'Енергія віддачі K_e': 'Recoil energy K_e',
      'Перехід n_i → n_f': 'Transition n_i → n_f',
      'Довжина хвилі лінії λ': 'Spectral line λ',
      'Число хвиль де Бройля': 'de Broglie waves',
      'Індукція в центрі B(0)': 'Center induction B(0)',
      'Індукція в площині витка': 'Coil-plane B',
      'Неоднорідність у центрі': 'Center inhomogeneity',
      'Конфігурація d/R': 'Configuration d/R',
      'Коефіцієнт k = N₂/N₁': 'Turns ratio k = N₂/N₁',
      'Первинна напруга U₁': 'Primary voltage U₁',
      'Вторинна напруга U₂': 'Secondary voltage U₂',
      'Режим трансформатора': 'Transformer mode'
    };

    function translateTelemetryVal(valStr) {
      if (uiState.lang !== 'en' || typeof valStr !== 'string') return valStr;
      return valStr
        .replace('ПВВ (повне відбиття)', 'TIR (total reflection)')
        .replace('Протидіє росту Φ', 'Opposes Φ growth')
        .replace('Підтримує спад Φ', 'Opposes Φ drop')
        .replace('Ударна хвиля Маха', 'Mach shockwave')
        .replace('0.00 м (фронт Маха)', '0.00 m (Mach front)')
        .replace('Повне гасіння (I = 0)', 'Full extinction (I = 0)')
        .replace('1→2 Ізотерм. розширення (T₁)', '1→2 Isothermal exp. (T₁)')
        .replace('2→3 Адіабатне розширення', '2→3 Adiabatic expansion')
        .replace('3→4 Ізотерм. стиснення (T₂)', '3→4 Isothermal comp. (T₂)')
        .replace('4→1 Адіабатне стиснення', '4→1 Adiabatic compression')
        .replace('Усталений (a ≈ 0)', 'Terminal (a ≈ 0)')
        .replace('Розгін (a > 0)', 'Accelerating (a > 0)')
        .replace('Притягання (↑↑)', 'Attraction (↑↑)')
        .replace('Відштовхування (↑↓)', 'Repulsion (↑↓)')
        .replace('p-тип (дірки +e)', 'p-type (holes +e)')
        .replace('n-тип (електрони -e)', 'n-type (electrons -e)')
        .replace('Увігнутий (змочування)', 'Concave (wetting)')
        .replace('Опуклий (незмочування)', 'Convex (non-wetting)')
        .replace('Інтерференційний максимум', 'Constructive maximum')
        .replace('Інтерференційний мінімум', 'Destructive minimum')
        .replace('Лаймана (УФ)', 'Lyman (UV)')
        .replace('Бальмера (видима)', 'Balmer (visible)')
        .replace('Пашена (ІЧ)', 'Paschen (IR)')
        .replace('λ_дБ на колі', 'λ_dB on orbit')
        .replace('1.00 (Плато Гельмгольца)', '1.00 (Helmholtz plateau)')
        .replace('Підвищувальний (U₂ > U₁)', 'Step-up (U₂ > U₁)')
        .replace('Знижувальний (U₂ < U₁)', 'Step-down (U₂ < U₁)')
        .replace('Ізолювальний (1:1)', 'Isolation (1:1)')
        .replace('Лінійна', 'Linear')
        .replace('Колова', 'Circular')
        .replace('Еліптична', 'Elliptical')
        .replace(/тис\. км\/с/g, 'k km/s')
        .replace(/кг·м²\/с/g, 'kg·m²/s')
        .replace(/кг·м\/с/g, 'kg·m/s')
        .replace(/кг·м²/g, 'kg·m²')
        .replace(/см³\/Кл/g, 'cm³/C')
        .replace(/мкм²\/с/g, 'μm²/s')
        .replace(/м²\/с/g, 'm²/s')
        .replace(/мН\/м/g, 'mN/m')
        .replace(/кН\/м/g, 'kN/m')
        .replace(/Вт\/м²/g, 'W/m²')
        .replace(/кВ\/м/g, 'kV/m')
        .replace(/В\/м/g, 'V/m')
        .replace(/рад\/с/g, 'rad/s')
        .replace(/м\/с²/g, 'm/s²')
        .replace(/км\/с/g, 'km/s')
        .replace(/м\/с/g, 'm/s')
        .replace(/л\/с/g, 'L/s')
        .replace(/Н·м/g, 'N·m')
        .replace(/а\.о\./g, 'AU')
        .replace(/дптр/g, 'dpt')
        .replace(/мкТл/g, 'μT')
        .replace(/мТл/g, 'mT')
        .replace(/мкА/g, 'μA')
        .replace(/мкм/g, 'μm')
        .replace(/МПа/g, 'MPa')
        .replace(/МеВ/g, 'MeV')
        .replace(/кеВ/g, 'keV')
        .replace(/еВ/g, 'eV')
        .replace(/фм/g, 'fm')
        .replace(/пм/g, 'pm')
        .replace(/мВб/g, 'mWb')
        .replace(/мВт/g, 'mW')
        .replace(/мВ/g, 'mV')
        .replace(/мДж/g, 'mJ')
        .replace(/мН/g, 'mN')
        .replace(/мм/g, 'mm')
        .replace(/кПа/g, 'kPa')
        .replace(/Па/g, 'Pa')
        .replace(/атм/g, 'atm')
        .replace(/кН/g, 'kN')
        .replace(/нм/g, 'nm')
        .replace(/см/g, 'cm')
        .replace(/Гц/g, 'Hz')
        .replace(/од\./g, 'u.')
        .replace(/Дж/g, 'J')
        .replace(/Тл/g, 'T')
        .replace(/ А$/g, ' A')
        .replace(/ Н$/g, ' N')
        .replace(/ В$/g, ' V')
        .replace(/ л$/g, ' L')
        .replace(/ К$/g, ' K')
        .replaceAll(' м)', ' m)')
        .replaceAll(' м ', ' m ')
        .replace(/ м$/g, ' m')
        .replace(/ с$/g, ' s');
    }

    const UI_STRINGS = {
      en: {
        docTitle: 'General Physics Course — Interactive 3D Textbook',
        spineSub: 'Archive Vol. I–IV',
        spineMain: 'Physics Practicum',
        prevTitle: 'Previous chapter',
        nextTitle: 'Next chapter',
        adHdrBadge: 'AD',
        adHdrText: 'Educational Resource',
        adHdrSub: 'Google AdSense · Direct Sponsor Banner · Educational & Lab Equipment Partners',
        adHdrCta: 'Place Ad →',
        adLeftLabel: 'Advertisement',
        adLeftTitle: 'Place for Your Ad',
        adLeftSub: 'Banner 320×100 px or responsive AdSense unit',
        adRightLabel: 'Sponsored / Ad Unit',
        adRightTitle: 'Place for Advertisement',
        adRightSub: 'Standard 300×250 Medium Rectangle for Google AdSense or partner banner',
        filterAll: 'All Experiments (46)',
        filterOptics: 'Light & Wavefront (14)',
        filterMechanics: 'Mechanics (15)',
        filterThermo: 'Fluids & Thermo (9)',
        filterElectro: 'Electromagnetism (8)',
        crumbPredict: 'I. Hypothesis',
        crumbTest: 'II. Experiment',
        crumbExplain: 'III. Proof',
        camIso: 'Isometric',
        camFront: 'Front',
        camTop: 'Plan',
        camSide: 'Profile',
        camMacro: 'Macro',
        camOrbit: '360° Orbit',
        problemLabel: 'Prediction Problem',
        yourAnswer: 'Your hypothesis:',
        changeBtn: 'Change',
        runExp: 'Run Experiment',
        continueExp: 'Resume Experiment',
        repeatExp: 'Repeat with Different Parameters',
        pauseBtn: 'Pause',
        resumeBtn: 'Resume',
        stepBtn: 'Step +0.02s',
        resetBtn: 'Reset',
        verdictCorrect: '✓ Experiment confirmed your hypothesis',
        verdictIncorrect: '✗ Experiment refuted the hypothesis — let\'s review the theory',
        eqHeaderLeft: 'Analytical Law',
        eqHeaderRight: 'Formula',
        energyBalanceTitle: 'System Energy Balance',
        refHeadingLeft: 'Fundamental Relations',
        refHeadingRight: 'Theory',
        paramsHeading: 'Apparatus Parameters',
        presetDefault: 'Default Values',
        diagramHeading: 'Diagram Overlays',
        toggleVectors: 'Force & Velocity Vectors',
        toggleLabels: 'Vector Symbol Labels',
        toggleTrails: 'Trajectories & Guide Lines',
        toggleParticles: 'Wavefronts & Thermal Particles',
        legendV: '<span class="legend-bar" style="background:#166534;"></span> Velocity ($\\vec{v}$)',
        legendP: '<span class="legend-bar" style="background:#1d4ed8;"></span> Momentum / Projections',
        legendMg: '<span class="legend-bar" style="background:#b91c1c;"></span> Gravity ($m\\vec{g}$)',
        legendN: '<span class="legend-bar" style="background:#b45309;"></span> Normal / Tension / Pressure',
        letters: ['A', 'B', 'C'],
        optionPrefix: 'Option',
        secUnit: 's',
        jouleUnit: 'J',
        theoryBtnTitle: 'Theoretical Notes',
        theoryBtnShort: 'Theory',
        theoryExpandHint: 'Read',
        theoryCollapseHint: 'Close',
        theorySec1Title: '1. Physical Essence & Mechanism',
        theorySec2Title: '2. Mathematical Model & Conservation Laws',
        theorySec3Title: '3. Experimental Analysis & Applications',
        mobileUnsupportedTitle: 'This platform is not supported on this device',
        mobileUnsupportedSub: 'The interactive 3D physics laboratory is designed for desktop and laptop computers. Please open this site on a PC.'
      },
      uk: {
        docTitle: 'Курс Загальної Фізики — Інтерактивний 3D-Підручник',
        spineSub: 'Видання І–ІV',
        spineMain: 'Фізичний практикум',
        prevTitle: 'Попередній параграф',
        nextTitle: 'Наступний параграф',
        adHdrBadge: 'AD',
        adHdrText: 'Освітній ресурс та обладнання',
        adHdrSub: 'Google AdSense · Прямий партнерський банер · Освітні та наукові проєкти',
        adHdrCta: 'Розмістити →',
        adLeftLabel: 'Рекламний блок',
        adLeftTitle: 'Місце для реклами',
        adLeftSub: 'Горизонтальний банер 320×100 px або адаптивний блок AdSense',
        adRightLabel: 'Партнерський блок / Реклама',
        adRightTitle: 'Місце для вашої реклами',
        adRightSub: 'Стандартний блок 300×250 px під Google AdSense або банер',
        filterAll: 'Усі досліди (46)',
        filterOptics: 'Світло і фронт (14)',
        filterMechanics: 'Механіка (15)',
        filterThermo: 'Рідини та МКТ (9)',
        filterElectro: 'Електромагнетизм (8)',
        crumbPredict: 'І. Гіпотеза',
        crumbTest: 'ІІ. Дослід',
        crumbExplain: 'ІІІ. Доведення',
        camIso: 'Ізометрія',
        camFront: 'Фронт',
        camTop: 'План',
        camSide: 'Профіль',
        camMacro: 'Макро',
        camOrbit: 'Огляд 360°',
        problemLabel: 'Задача для передбачення',
        yourAnswer: 'Ваша відповідь:',
        changeBtn: 'Переобрати',
        runExp: 'Розпочати дослід',
        continueExp: 'Продовжити дослід',
        repeatExp: 'Повторити дослід з іншими параметрами',
        pauseBtn: 'Пауза',
        resumeBtn: 'Продовжити',
        stepBtn: 'Крок +0.02с',
        resetBtn: 'Скинути',
        verdictCorrect: '✓ Дослід підтвердив вашу гіпотезу',
        verdictIncorrect: '✗ Дослід спростував гіпотезу — розгляньмо теорію',
        eqHeaderLeft: 'Аналітичний запис закону',
        eqHeaderRight: 'Формула',
        energyBalanceTitle: 'Енергетичний баланс системи',
        refHeadingLeft: 'Основні співвідношення',
        refHeadingRight: 'Теорія',
        paramsHeading: 'Параметри установки',
        presetDefault: 'Еталонні значення',
        diagramHeading: 'Графічні позначення на схемі',
        toggleVectors: 'Вектори сил та швидкостей',
        toggleLabels: 'Буквені позначення векторів',
        toggleTrails: 'Траєкторії та допоміжні лінії',
        toggleParticles: 'Світлові фронти та теплові частинки',
        legendV: '<span class="legend-bar" style="background:#166534;"></span> Швидкість ($\\vec{v}$)',
        legendP: '<span class="legend-bar" style="background:#1d4ed8;"></span> Імпульс / Проєкції',
        legendMg: '<span class="legend-bar" style="background:#b91c1c;"></span> Сила тяжіння ($m\\vec{g}$)',
        legendN: '<span class="legend-bar" style="background:#b45309;"></span> Реакція / Натяг / Тиск',
        letters: ['А', 'Б', 'В'],
        optionPrefix: 'Варіант',
        secUnit: 'с',
        jouleUnit: 'Дж',
        theoryBtnTitle: 'Теоретичний конспект',
        theoryBtnShort: 'Теорія',
        theoryExpandHint: 'Читати',
        theoryCollapseHint: 'Згорнути',
        theorySec1Title: '1. Фізична суть і механізм явища',
        theorySec2Title: '2. Математична модель і закони збереження',
        theorySec3Title: '3. Лабораторний аналіз і застосування',
        mobileUnsupportedTitle: 'Дана платформа не підтримується на даному пристрої',
        mobileUnsupportedSub: 'Інтерактивний 3D-практикум з фізики розрахований на роботу з комп’ютера або ноутбука. Будь ласка, відкрийте сайт на ПК.'
      }
    };

    // ============================================================================
    // ПОВНИЙ АКАДЕМІЧНИЙ КОНСПЕКТ ТЕОРІЇ ДЛЯ ВСІХ 46 ЕКСПЕРИМЕНТІВ (УКР / EN)
    // ============================================================================
    const THEORY_NOTES = {
      collision: {
        uk: [
          'У замкненій механічній системі, де зовнішні сили врівноважені або відсутні ($\\sum \\vec{F}_{\\text{зовн}} = 0$), за ІІІ законом Ньютона внутрішні сили ударної взаємодії двох тіл у кожну мить рівні за модулем і протилежні за напрямком: $\\vec{F}_{12} = -\\vec{F}_{21}$. Тому сумарний імпульс системи $\\vec{p} = m_1\\vec{v}_1 + m_2\\vec{v}_2$ залишається строго інваріантним при будь-якому характері зіткнення — від абсолютно пружного до повністю пластичного.',
          'Характер деформації тіл визначається **коефіцієнтом відновлення** $e = \\frac{|v\'_2 - v\'_1|}{|v_1 - v_2|} \\in [0, 1]$. У системі відліку центра мас зі швидкістю $v_C = \\frac{m_1 v_1 + m_2 v_2}{m_1 + m_2}$ після удару швидкості тіл становлять $v\'_1 = v_C - e \\frac{m_2}{m_1 + m_2}(v_1 - v_2)$ та $v\'_2 = v_C + e \\frac{m_1}{m_1 + m_2}(v_1 - v_2)$. Частина початкової кінетичної енергії переходить у внутрішню теплову енергію деформації: $Q = \\frac{1}{2}\\mu (v_1 - v_2)^2 (1 - e^2)$, де $\\mu = \\frac{m_1 m_2}{m_1 + m_2}$ — **зведена маса** двочастинкової системи.',
          'Змінюючи повзунками відношення мас $m_1/m_2$ та пружність $e$, простежте два граничні режими: при $e = 1$ і $m_1 = m_2$ кулі повністю обмінюються швидкостями ($Q = 0$), а при $e = 0$ тіла злипаються і рухаються як єдине ціле зі швидкістю центра мас $v_C$. Цей принцип лежить в основі балістичних маятників, розрахунку сповільнювачів нейтронів у ядерних реакторах та аналізу зіткнень елементарних частинок у колайдерах.'
        ],
        en: [
          'In an isolated mechanical system where external forces cancel out ($\\sum \\vec{F}_{\\text{ext}} = 0$), Newton’s third law guarantees that internal impact forces between two colliding bodies are equal in magnitude and opposite in direction at every instant: $\\vec{F}_{12} = -\\vec{F}_{21}$. Consequently, the total linear momentum $\\vec{p} = m_1\\vec{v}_1 + m_2\\vec{v}_2$ remains strictly conserved across all collision regimes, from perfectly elastic to completely plastic.',
          'The degree of elasticity is governed by the **coefficient of restitution** $e = \\frac{|v\'_2 - v\'_1|}{|v_1 - v_2|} \\in [0, 1]$. Relative to the center-of-mass velocity $v_C = \\frac{m_1 v_1 + m_2 v_2}{m_1 + m_2}$, the post-impact velocities are $v\'_1 = v_C - e \\frac{m_2}{m_1 + m_2}(v_1 - v_2)$ and $v\'_2 = v_C + e \\frac{m_1}{m_1 + m_2}(v_1 - v_2)$. The dissipated mechanical energy converted into internal heat and plastic deformation is $Q = \\frac{1}{2}\\mu (v_1 - v_2)^2 (1 - e^2)$, where $\\mu = \\frac{m_1 m_2}{m_1 + m_2}$ is the **reduced mass**.',
          'By varying the mass ratio $m_1/m_2$ and restitution $e$, observe the two fundamental limits: for $e = 1$ and $m_1 = m_2$, the spheres completely exchange velocities ($Q = 0$), whereas for $e = 0$ they coalesce and move at the center-of-mass velocity $v_C$. This formalism underpins ballistic pendulums, neutron moderation in nuclear reactors, and particle collider kinematics.'
        ]
      },
      inclined: {
        uk: [
          'На тіло масою $m$, що перебуває на похилій площині з кутом нахилу $\\alpha$, діють три сили: вертикальна сила тяжіння $m\\vec{g}$, сила нормальної реакції опори $\\vec{N}$ (перпендикулярна до поверхні клина) та сила тертя $\\vec{F}_{\\text{тер}}$ (спрямована вздовж схилу проти руху або тенденції до зісковзування). Розкладання вектора $m\\vec{g}$ на дотичну вісь $Ox$ та нормальну вісь $Oy$ дозволяє звести двовимірну задачу до одновимірного руху вздовж схилу.',
          'З умови рівноваги вздовж нормалі $Oy$ маємо $N = mg\\cos\\alpha$. Максимальна сила тертя спокою за законом Амонтона — Кулона становить $F_{\\text{тер,max}} = \\mu N = \\mu mg\\cos\\alpha$. Якщо скочувальна складова перевищує цей поріг ($mg\\sin\\alpha > \\mu mg\\cos\\alpha$, тобто $\\tan\\alpha > \\mu$), тіло починає рівноприскорений рух із прискоренням $a = g(\\sin\\alpha - \\mu\\cos\\alpha)$, яке **не залежить від маси бруска** $m$.',
          'Критичний кут $\\alpha_{\\text{кр}} = \\arctan(\\mu)$ називають **кутом тертя**: саме його вимірюють у трибологічних лабораторіях для точного визначення коефіцієнта тертя $\\mu$ без динамометра. Зверніть увагу на енергетичну діаграму: потенціальна енергія $E_p = mgh$ розподіляється між кінетичною енергією бруска $E_k = \\frac{1}{2}mv^2$ та роботою проти сили тертя $Q = \\mu mg\\cos\\alpha \\cdot s$.'
        ],
        en: [
          'A block of mass $m$ resting on an inclined plane at angle $\\alpha$ is acted upon by three forces: gravity $m\\vec{g}$ pointing vertically downward, the normal reaction $\\vec{N}$ perpendicular to the ramp, and friction $\\vec{F}_{\\text{fr}}$ directed up the slope opposing motion. Resolving $m\\vec{g}$ into components parallel ($Ox$) and perpendicular ($Oy$) to the incline reduces the problem to 1D dynamics.',
          'Force balance normal to the ramp yields $N = mg\\cos\\alpha$. By Amontons–Coulomb’s law, the maximum static friction is $F_{\\text{fr,max}} = \\mu N = \\mu mg\\cos\\alpha$. Motion begins only when the downhill gravitational component exceeds this threshold ($\\tan\\alpha > \\mu$), producing a uniform acceleration $a = g(\\sin\\alpha - \\mu\\cos\\alpha)$ that is **strictly independent of the mass** $m$.',
          'The threshold angle $\\alpha_c = \\arctan(\\mu)$ is known as the **angle of repose**, widely used in tribology and geotechnical engineering to measure $\\mu$ directly. Watch the energy balance chart: initial potential energy $E_p = mgh$ partitions into translational kinetic energy $E_k = \\frac{1}{2}mv^2$ and frictional heat $Q = \\mu mg\\cos\\alpha \\cdot s$.'
        ]
      },
      pendulum: {
        uk: [
          'Гармонічні коливання виникають у системах, де повертальна сила пропорційна зміщенню від положення рівноваги і спрямована до нього: $F_x = -kx$. У математичному маятнику повертальною силою є дотична складова тяжіння $F_\\tau = -mg\\sin\\theta \\approx -mg\\theta = -\\frac{mg}{L}s$ (при малих кутах $\\theta \\ll 1\\text{ рад}$), а в пружинному маятнику — пружна сила Гука $F = -ky$.',
          'Диференціальне рівняння вільних коливань з урахуванням в’язкого опору середовища має вигляд $\\ddot{x} + 2\\beta\\dot{x} + \\omega_0^2 x = 0$. Для математичного маятника власна циклічна частота $\\omega_0 = \\sqrt{g/L}$ і період **формули Гюйгенса** $T_0 = 2\\pi\\sqrt{L/g}$ визначаються лише довжиною нитки $L$ та прискоренням вільного падіння $g$. Для пружинного маятника $\\omega_0 = \\sqrt{k/m}$ та $T_0 = 2\\pi\\sqrt{m/k}$ залежать від маси тягарця $m$ і жорсткості пружини $k$, але **не залежать від гравітації**.',
          'Під час коливань відбувається безперервне перетворення енергії двічі за кожен період: у крайніх точках уся енергія зосереджена в потенціальній ($E_p$), а при проходженні положення рівноваги — в кінетичній ($E_k$). Наявність дисипації ($\\beta > 0$) зумовлює експоненціальне спадання амплітуди $A(t) = A_0 e^{-\\beta t}$ і поступовий перехід механічної енергії у тепло $Q$.'
        ],
        en: [
          'Simple harmonic motion arises whenever a restoring force is proportional to the displacement from equilibrium: $F_x = -kx$. In a simple gravity pendulum, the restoring force is the tangential component of weight $F_\\tau = -mg\\sin\\theta \\approx -\\frac{mg}{L}s$ (for small angles $\\theta \\ll 1\\text{ rad}$), whereas in a spring-mass oscillator it is Hooke’s elastic force $F = -ky$.',
          'The damped oscillator obeys $\\ddot{x} + 2\\beta\\dot{x} + \\omega_0^2 x = 0$. For the simple pendulum, the natural angular frequency $\\omega_0 = \\sqrt{g/L}$ and **Huygens’ period** $T_0 = 2\\pi\\sqrt{L/g}$ depend solely on string length $L$ and gravity $g$ (isochronism). Conversely, for the spring pendulum, $\\omega_0 = \\sqrt{k/m}$ and $T_0 = 2\\pi\\sqrt{m/k}$ depend on mass $m$ and stiffness $k$, remaining **independent of gravity**.',
          'Twice during every oscillation period, energy converts completely between potential energy $E_p$ at the turning points and kinetic energy $E_k$ at equilibrium. With damping ($\\beta > 0$), the amplitude decays exponentially as $A(t) = A_0 e^{-\\beta t}$, transferring mechanical energy into thermal dissipation $Q$.'
        ]
      },
      projectile: {
        uk: [
          'Балістичний рух тіла, кинутого під кутом $\\alpha$ до горизонту зі швидкістю $v_0$, є класичним прикладом **принципу незалежності рухів Галілея**. У вакуумі ($k = 0$) вздовж горизонтальної осі $Ox$ діють нульові сили, тому проєкція швидкості $v_x = v_0\\cos\\alpha = \\text{const}$, а вздовж вертикальної осі $Oy$ тіло здійснює рівноприскорений рух під дією сили тяжіння з прискоренням $a_y = -g$.',
          'Виключення часу $t = \\frac{x}{v_0\\cos\\alpha}$ з кінематичних рівнянь $x(t) = v_0\\cos\\alpha \\cdot t$ та $y(t) = v_0\\sin\\alpha \\cdot t - \\frac{1}{2}gt^2$ дає **рівняння параболи безпеки**: $y(x) = x\\tan\\alpha - \\frac{gx^2}{2v_0^2\\cos^2\\alpha}$. Повний час польоту становить $t_{\\text{польоту}} = \\frac{2v_0\\sin\\alpha}{g}$, максимальна висота підйому $H = \\frac{v_0^2\\sin^2\\alpha}{2g}$, а горизонтальна дальність $L = \\frac{v_0^2\\sin(2\\alpha)}{g}$ досягає максимуму при $\\alpha = 45^\\circ$.',
          'При врахуванні опору повітря ($\\vec{F}_{\\text{оп}} = -k\\vec{v}$) рівняння руху по осях стають зв’язаними через дисипацію: горизонтальна швидкість спадає експоненціально $v_x(t) = v_{0x}e^{-(k/m)t}$, низхідна гілка траєкторії стає крутішою за висхідну (балістична крива Тартальї), а оптимальний кут максимальної дальності зміщується в область $\\alpha < 45^\\circ$.'
        ],
        en: [
          'Projectile motion launched at angle $\\alpha$ with initial speed $v_0$ exemplifies **Galileo’s principle of independence of motions**. In vacuum ($k = 0$), no horizontal force acts along $Ox$, keeping $v_x = v_0\\cos\\alpha = \\text{const}$, while along the vertical axis $Oy$ gravity produces constant downward acceleration $a_y = -g$.',
          'Eliminating time $t = \\frac{x}{v_0\\cos\\alpha}$ from $x(t) = v_0\\cos\\alpha \\cdot t$ and $y(t) = v_0\\sin\\alpha \\cdot t - \\frac{1}{2}gt^2$ yields the **parabolic trajectory equation**: $y(x) = x\\tan\\alpha - \\frac{gx^2}{2v_0^2\\cos^2\\alpha}$. The time of flight is $t_{\\text{flight}} = \\frac{2v_0\\sin\\alpha}{g}$, the apex height is $H = \\frac{v_0^2\\sin^2\\alpha}{2g}$, and the horizontal range $L = \\frac{v_0^2\\sin(2\\alpha)}{g}$ peaks at $\\alpha = 45^\\circ$.',
          'When linear aerodynamic drag ($\\vec{F}_d = -k\\vec{v}$) is introduced, horizontal velocity decays exponentially as $v_x(t) = v_{0x}e^{-(k/m)t}$, the descending branch becomes steeper than the ascending branch (Tartaglia’s ballistic curve), and the optimal launch angle for maximum range shifts below $45^\\circ$.'
        ]
      },
      cradle: {
        uk: [
          'Колиска Ньютона наочно демонструє, що **одного лише закону збереження імпульсу недостатньо** для однозначного визначення результату удару — необхідне одночасне виконання і закону збереження імпульсу, і закону збереження механічної енергії. Коли $N$ куль однакової маси $m$ налітають зі швидкістю $v_0$ на ланцюжок нерухомих куль, через них поширюється пружний імпульс стиснення (хвиля Герца).',
          'Припустимо, що після удару $N$ куль зі швидкістю $v_0$ відскочило б $k$ куль зі швидкістю $u$. Тоді із збереження імпульсу $Nmv_0 = kmu$ та збереження кінетичної енергії $N\\frac{mv_0^2}{2} = k\\frac{mu^2}{2}$ шляхом ділення другого рівняння на перше отримуємо $u = v_0$, а отже, обов’язково **$k = N$**. Тобто відлітає рівно стільки ж куль, скільки було відхилено на початку!',
          'Якщо коефіцієнт відновлення $e < 1$ (неідеальна пружність сталі та втрати на акустичне випромінювання), під час кожного удару частина енергії розсіюється у тепло $Q$. Через це центральні кулі поступово набувають невеликої синфазної швидкості, а амплітуда коливань усієї системи згасає.'
        ],
        en: [
          'Newton’s cradle vividly demonstrates that **conservation of momentum alone is insufficient** to uniquely determine the outcome of a collision—both linear momentum and kinetic energy must be conserved simultaneously. When $N$ identical spheres of mass $m$ strike a stationary row at velocity $v_0$, a rapid elastic compression pulse (Hertzian contact wave) propagates through the chain.',
          'Suppose $k$ spheres were ejected at velocity $u$ after $N$ spheres struck at speed $v_0$. Enforcing momentum conservation $Nmv_0 = kmu$ and kinetic energy conservation $N\\frac{mv_0^2}{2} = k\\frac{mu^2}{2}$ and dividing the two equations immediately yields $u = v_0$ and therefore **$k = N$**. Exactly the same number of spheres must swing out on the far side!',
          'When the restitution coefficient $e < 1$ (accounting for internal acoustic losses and imperfect steel elasticity), each impact dissipates a small fraction of mechanical energy into heat $Q$, gradually exciting small collective oscillations across all spheres.'
        ]
      },
      centripetal: {
        uk: [
          'Будь-який криволінійний рух є прискореним: навіть за незмінного модуля швидкості ($v = \\text{const}$) вектор швидкості $\\vec{v}$, спрямований по дотичній до траєкторії, безперервно змінює свій напрямок у просторі. Швидкість повороту вектора $\\vec{v}$ характеризується **доцентровим (нормальним) прискоренням** $\\vec{a}_n$, яке завжди напрямлене вздовж радіуса до центра кривини траєкторії.',
          'З геометричної подібності трикутника переміщень $\\Delta\\vec{r}$ і трикутника приросту швидкостей $\\Delta\\vec{v}$ за малий інтервал $\\Delta t \\to 0$ випливає формула Гюйгенса: $a_n = \\frac{v^2}{R} = \\omega^2 R$. За ІІ законом Ньютона це прискорення створюється рівнодійною всіх сил у радіальному напрямку $F_n = \\frac{mv^2}{R}$. На горизонтальному повороті роль утримувальної доцентрової сили виконує сила тертя спокою коліс об дорожнє полотно: $F_{\\text{тер}} \\le \\mu mg$.',
          'Умова безпечного проходження повороту без заносу має вигляд $\\frac{mv^2}{R} \\le \\mu mg$, звідки критична швидкість **$v_{\\text{max}} = \\sqrt{\\mu g R}$**. Якщо перевищити цей поріг, поперечного зчеплення шин не вистачить для викривлення траєкторії по радіусу $R$, і автомобіль за інерцією зійде з дуги по дотичній (на більший радіус).'
        ],
        en: [
          'Every curvilinear motion is accelerated: even when speed $v = \\text{const}$ is uniform, the tangent velocity vector $\\vec{v}$ continuously changes direction. The rate of rotation of $\\vec{v}$ defines the **centripetal (normal) acceleration** $\\vec{a}_n$, directed radially inward toward the center of curvature.',
          'From the geometric similarity of the position triangle $\\Delta\\vec{r}$ and velocity-change triangle $\\Delta\\vec{v}$ as $\\Delta t \\to 0$, one derives $a_n = \\frac{v^2}{R} = \\omega^2 R$. By Newton’s second law, this acceleration requires a net inward radial force $F_n = \\frac{mv^2}{R}$. On a flat horizontal turn, static tire friction provides this centripetal force: $F_{\\text{fr}} \\le \\mu mg$.',
          'The no-skid stability condition $\\frac{mv^2}{R} \\le \\mu mg$ sets the critical cornering speed **$v_{\\text{max}} = \\sqrt{\\mu g R}$**. Exceeding $v_{\\text{max}}$ means static friction can no longer bend the trajectory along radius $R$, causing the vehicle to skid outward toward the tangent.'
        ]
      },
      archimedes: {
        uk: [
          'Гідростатичний тиск у нерухомій рідині густиною $\\rho_{\\text{рід}}$ зростає з глибиною за законом Паскаля — Стевіна: $p(h) = p_0 + \\rho_{\\text{рід}} g h$. Через це на нижню грань зануреного тіла діє більший тиск, ніж на верхню, а поверхневий інтеграл сил тиску по замкненій поверхні тіла дає напрямлену вертикально вгору **виштовхувальну силу Архімеда** $\\vec{F}_A$.',
          'Модуль сили Архімеда дорівнює вазі рідини в об’ємі зануреної частини тіла $V_{\\text{зан}}$: $F_A = \\rho_{\\text{рід}} g V_{\\text{зан}}$. Динаміка вертикального руху тіла об’ємом $V$ і густиною $\\rho_{\\text{тіла}}$ визначається балансом сили тяжіння $mg = \\rho_{\\text{тіла}} g V$, сили Архімеда $F_A$ та гідродинамічного опору води.',
          'Співвідношення густин визначає три режими плавання: 1) при **$\\rho_{\\text{тіла}} < \\rho_{\\text{рід}}$** тіло спливає і в рівновазі занурене на частку об’єму $\\frac{V_{\\text{зан}}}{V} = \\frac{\\rho_{\\text{тіла}}}{\\rho_{\\text{рід}}}$; 2) при **$\\rho_{\\text{тіла}} = \\rho_{\\text{рід}}$** тіло перебуває в байдужій рівновазі на будь-якій глибині (як підводний човен); 3) при **$\\rho_{\\text{тіла}} > \\rho_{\\text{рід}}$** тіло тоне з ефективною вагою у воді $P_{\\text{еф}} = (\\rho_{\\text{тіла}} - \\rho_{\\text{рід}})gV$.'
        ],
        en: [
          'Hydrostatic pressure in a stationary fluid of density $\\rho_{\\text{fluid}}$ increases linearly with depth: $p(h) = p_0 + \\rho_{\\text{fluid}} g h$. Because the upward pressure on the bottom surface of a submerged body exceeds the downward pressure on its top, integrating pressure forces over the body’s surface yields an upward **Archimedean buoyant force** $\\vec{F}_A$.',
          'By Archimedes’ principle, the buoyant force equals the weight of the displaced fluid: $F_A = \\rho_{\\text{fluid}} g V_{\\text{sub}}$. Vertical motion of a body of total volume $V$ and density $\\rho_{\\text{body}}$ is governed by the interplay between weight $mg = \\rho_{\\text{body}} g V$, buoyancy $F_A$, and fluid drag.',
          'Three regimes emerge from the density ratio: 1) if **$\\rho_{\\text{body}} < \\rho_{\\text{fluid}}$**, the body floats at the surface with submerged fraction $\\frac{V_{\\text{sub}}}{V} = \\frac{\\rho_{\\text{body}}}{\\rho_{\\text{fluid}}}$; 2) if **$\\rho_{\\text{body}} = \\rho_{\\text{fluid}}$**, it achieves neutral buoyancy at any depth; 3) if **$\\rho_{\\text{body}} > \\rho_{\\text{fluid}}$**, it sinks to the bottom with apparent weight $W_{\\text{app}} = (\\rho_{\\text{body}} - \\rho_{\\text{fluid}})gV$.'
        ]
      },
      gas: {
        uk: [
          'З погляду молекулярно-кінетичної теорії (МКТ), макроскопічний тиск газу $P$ є результатом мільярдів пружних ударів хаотично рухомих молекул об стінки циліндра та рухомий поршень. Середня кінетична енергія поступального руху однієї молекули прямо пропорційна абсолютній температурі: $\\langle \\varepsilon_k \\rangle = \\frac{3}{2}k_B T$, де $k_B = 1.38\\times 10^{-23}\\text{ Дж/К}$ — стала Больцмана.',
          'Основне рівняння МКТ $P = n k_B T = \\frac{1}{3}n m_0 \\langle v^2 \\rangle$ при переході до кількості речовини $\\nu = N / N_A$ дає **рівняння стану ідеального газу Менделєєва — Клапейрона**: $PV = \\nu R T$, де $R = k_B N_A = 8.314\\text{ Дж/(моль}\\cdot\\text{К)}$. Внутрішня енергія одноатомного ідеального газу визначається лише його температурою: $U = \\frac{3}{2}\\nu R T = \\frac{3}{2}PV$.',
          'У нашій 3D-установці при фіксованій кількості газу $\\nu$ ви можете дослідити **ізотермічне стиснення Бойля — Маріотта** ($T = \\text{const} \\implies P \\propto 1/V$) та **ізохорний чи ізобарний нагрів Гей-Люссака / Шарля**: підвищення температури $T$ збільшує середню квадратичну швидкість частинок $v_{\\text{кв}} = \\sqrt{3RT/M}$ і змушує газ виконувати додатну термодинамічну роботу $A = \\int P\\,dV$.'
        ],
        en: [
          'In the kinetic theory of gases, macroscopic pressure $P$ originates from the collective momentum transfer of myriad molecules elastically colliding with the cylinder walls and piston. The average translational kinetic energy per molecule is directly proportional to absolute temperature: $\\langle \\varepsilon_k \\rangle = \\frac{3}{2}k_B T$, where $k_B = 1.38\\times 10^{-23}\\text{ J/K}$ is Boltzmann’s constant.',
          'Combining $P = n k_B T = \\frac{1}{3}n m_0 \\langle v^2 \\rangle$ with molar amount $\\nu = N/N_A$ yields the **Ideal Gas Law (Clapeyron–Mendeleev equation)**: $PV = \\nu R T$, with universal gas constant $R = 8.314\\text{ J/(mol}\\cdot\\text{K)}$. For a monatomic ideal gas, internal energy depends solely on temperature: $U = \\frac{3}{2}\\nu R T = \\frac{3}{2}PV$.',
          'Using the sliders, explore **Boyle’s isothermal compression** ($T = \\text{const} \\implies P \\propto 1/V$) and **Charles’s / Gay-Lussac’s thermal laws**: raising temperature $T$ increases the root-mean-square molecular speed $v_{\\text{rms}} = \\sqrt{3RT/M}$ and drives mechanical expansion work $W = \\int P\\,dV$.'
        ]
      },
      wavefront: {
        uk: [
          'За **принципом Гюйгенса — Френеля**, кожна точка середовища, до якої дійшов світловий хвильовий фронт, стає джерелом вторинних сферичних (у прозорому середовищі — півсферичних) когерентних хвиль. Нове положення хвильового фронту в наступний момент часу $t + \\Delta t$ визначається як геометрична обвідна (огинаюча поверхня) усіх вторинних хвиль.',
          'Коли плоский світловий фронт падає під кутом $\\alpha$ із середовища з показником заломлення $n_1$ на межу поділу з оптично густішим середовищем $n_2 > n_1$, його фазова швидкість зменшується від $v_1 = c/n_1$ до $v_2 = c/n_2$. Поки правий край фронту проходить у першому середовищі відстань $BC = v_1 \\Delta t = AB\\sin\\alpha$, лівий край у другому середовищі встигає утворити півсферу меншого радіуса $AD = v_2 \\Delta t = AB\\sin\\gamma$. Ділення цих відрізків дає **закон заломлення Снелліуса**: $\\frac{\\sin\\alpha}{\\sin\\gamma} = \\frac{v_1}{v_2} = \\frac{n_2}{n_1}$.',
          'Зверніть увагу на 3D-сцену: при вході в оптично густіше скло ($n_2 > n_1$) відстань між сусідніми гребенями хвильового фронту (довжина хвилі $\\lambda_2 = \\lambda_0 / n_2$) стискається в $n_2/n_1$ разів, тоді як частота коливань $\\nu$ залишається незмінною, а нормаль до хвильового фронту повертається ближче до перпендикуляра ($\\gamma < \\alpha$).'
        ],
        en: [
          'According to the **Huygens–Fresnel principle**, every point on an advancing light wavefront acts as a point source of secondary spherical wavelets. The wavefront surface at a later instant $t + \\Delta t$ is formed by the forward tangent envelope of all these secondary wavelets.',
          'When an oblique plane wavefront strikes the interface between media of refractive indices $n_1$ and $n_2 > n_1$ at angle $\\alpha$, its phase velocity drops from $v_1 = c/n_1$ to $v_2 = c/n_2$. While the outer edge of the wavefront travels distance $BC = v_1 \\Delta t = AB\\sin\\alpha$ in medium 1, the edge that entered medium 2 expands only to radius $AD = v_2 \\Delta t = AB\\sin\\gamma$. Taking the ratio immediately proves **Snell’s Law of Refraction**: $\\frac{\\sin\\alpha}{\\sin\\gamma} = \\frac{v_1}{v_2} = \\frac{n_2}{n_1}$.',
          'Observe in 3D how entering optically denser glass ($n_2 > n_1$) compresses the spacing between wavefront crests ($\lambda_2 = \\lambda_0 / n_2$) while keeping frequency $\\nu$ constant, rotating the wavefront normal toward the interface normal ($\\gamma < \\alpha$).'
        ]
      },
      interference: {
        uk: [
          'Класичний дослід Томаса Юнга (1801 р.) довів хвильову природу світла. Коли плоский монохроматичний світловий фронт падає на екран із двома вузькими паралельними щілинами $S_1$ та $S_2$ на відстані $d$ одна від одної, за принципом Гюйгенса щілини стають двома **когерентними джерелами** циліндричних хвиль з однаковою частотою і сталою різницею фаз.',
          'У довільній точці екрана на відстані $L \\gg d$ накладаються дві хвилі, що пройшли геометричні шляхи $r_1$ та $r_2$. **Оптична різниця ходу** при малих кутах становить $\\Delta = r_2 - r_1 = d\\sin\\theta \\approx d\\frac{x}{L}$, що відповідає різниці фаз $\\Delta\\varphi = \\frac{2\\pi}{\\lambda}\\Delta$. Результуюча інтенсивність розподіляється за законом $I(x) = 4I_0 \\cos^2\\!\\left(\\frac{\\pi d \\cdot x}{\\lambda L}\\right)$: у максимумах ($\Delta = m\\lambda$) інтенсивність учетверо перевищує інтенсивність однієї щілини ($4I_0$), а в мінімумах ($\Delta = (m + \\tfrac{1}{2})\\lambda$) світло + світло дає темряву ($I = 0$).',
          'Відстань між сусідніми світлими смугами (ширина інтерференційної смуги) дорівнює **$\\Delta x = \\frac{\\lambda L}{d}$**. Тому збільшення довжини хвилі $\\lambda$ (перехід від фіолетового світла до червоного) розширює смуги на екрані, а розсування щілин $d$ робить інтерференційну гребінку густішою.'
        ],
        en: [
          'Thomas Young’s double-slit experiment (1801) established the wave nature of light. When a plane monochromatic wavefront illuminates two narrow slits $S_1$ and $S_2$ separated by distance $d$, Huygens’ principle turns the slits into two **coherent cylindrical wave sources** with identical frequency and locked phase.',
          'At position $x$ on a screen at distance $L \\gg d$, the two waves arrive with **path difference** $\\Delta = r_2 - r_1 = d\\sin\\theta \\approx d\\frac{x}{L}$ and phase difference $\\Delta\\varphi = \\frac{2\\pi}{\\lambda}\\Delta$. Superposition redistributes energy into fringes of intensity $I(x) = 4I_0 \\cos^2\\!\\left(\\frac{\\pi d \\cdot x}{\\lambda L}\\right)$: constructive maxima ($\\Delta = m\\lambda$) reach $4I_0$, while destructive minima ($\\Delta = (m + \\tfrac{1}{2})\\lambda$) cancel to zero ($I = 0$).',
          'The fringe spacing between adjacent bright bands is **$\\Delta x = \\frac{\\lambda L}{d}$**. Increasing wavelength $\\lambda$ (shifting from violet toward red light) widens the interference fringes, whereas increasing slit separation $d$ packs the fringes closer together.'
        ]
      },
      dispersion: {
        uk: [
          '**Нормальною дисперсією світла** називається залежність абсолютного показника заломлення речовини $n(\\lambda)$ від довжини світлової хвилі $\\lambda$ (або частоти $\\omega$). В області прозорості скла чи кварцу показник заломлення монотонно зростає при зменшенні довжини хвилі, що описується **емпіричною формулою Коші**: $n(\\lambda) = A + \\frac{B}{\\lambda^2} + \\frac{C}{\\lambda^4}$, де сталі $A, B, C$ визначаються власною частотою електронних осциляторів атома.',
          'При проходженні променя крізь тригранну призму із заломним кутом $A$ промінь двічі заломлюється на її гранях: $\\sin\\alpha_1 = n\\sin\\gamma_1$, $\\gamma_1 + \\gamma_2 = A$, $\\sin\\alpha_2 = n\\sin\\gamma_2$. Повний кут відхилення променя від початкового напрямку становить $\\delta(\\lambda) = \\alpha_1 + \\alpha_2 - A$ (для тонкої призми $\\delta \\approx (n(\\lambda) - 1)A$).',
          'Оскільки для коротких фіолетових хвиль ($\lambda \\approx 400\\text{ нм}$) фазова швидкість у склі найменша, а показник заломлення найбільший ($n_{\\text{фіол}} > n_{\\text{черв}}$), **фіолетові промені заломлюються сильніше за червоні** ($\delta_{\\text{фіол}} > \\delta_{\\text{черв}}$), розкладаючи вузький пучок білого світла у неперервний спектр Ньютона.'
        ],
        en: [
          '**Optical dispersion** is the dependence of a medium’s refractive index $n(\\lambda)$ on wavelength $\\lambda$. In transparent dielectrics such as crown or flint glass (normal dispersion), $n(\\lambda)$ increases as wavelength decreases according to **Cauchy’s equation**: $n(\\lambda) = A + \\frac{B}{\\lambda^2} + \\frac{C}{\\lambda^4}$, driven by ultraviolet electronic resonances of the material.',
          'Tracing a ray through a triangular prism of apex angle $A$ requires two Snell’s-law refractions: $\\sin\\alpha_1 = n\\sin\\gamma_1$, $\\gamma_1 + \\gamma_2 = A$, and $\\sin\\alpha_2 = n\\sin\\gamma_2$. The total angular deviation from the original beam direction is $\\delta(\\lambda) = \\alpha_1 + \\alpha_2 - A$ (or $\\delta \\approx (n(\\lambda) - 1)A$ for small apex angles).',
          'Because short-wavelength violet light ($\\lambda \\approx 400\\text{ nm}$) travels slower in glass and experiences a higher refractive index than red light ($n_{\\text{violet}} > n_{\\text{red}}$), **violet rays deviate most strongly** ($\\delta_{\\text{violet}} > \\delta_{\\text{red}}$), fanning white light out into Newton’s continuous rainbow spectrum.'
        ]
      },
      emwave: {
        uk: [
          'Згідно з теорією Джеймса Клерка Максвелла (1865 р.), змінне у часі магнітне поле породжує вихрове електричне поле ($\\nabla \\times \\vec{E} = -\\frac{\\partial \\vec{B}}{\\partial t}$), а змінне електричне поле (струм зміщення) породжує вихрове магнітне поле ($\\nabla \\times \\vec{B} = \\mu_0\\varepsilon_0 \\frac{\\partial \\vec{E}}{\\partial t}$). Внаслідок цього взаємного перетворення у просторі поширюється самопідтримувана **поперечна електромагнітна хвиля** зі швидкістю світла $c = \\frac{1}{\\sqrt{\\varepsilon_0\\mu_0}} \\approx 3\\times 10^8\\text{ м/с}$.',
          'У плоскій біжучій хвилі вектори напруженості електричного поля $\\vec{E}(x,t) = \\vec{E}_0\\sin(kx - \\omega t)$ та індукції магнітного поля $\\vec{B}(x,t) = \\vec{B}_0\\sin(kx - \\omega t)$ коливаються **строго в одній фазі** (синфазно), взаємно перпендикулярні ($\\vec{E} \\perp \\vec{B}$) та перпендикулярні до напрямку поширення хвилі $\\vec{k}$, утворюючи праву трійку векторів. У вакуумі їхні амплітуди пов’язані співвідношенням $E_0 = c B_0$.',
          'Густина потоку електромагнітної енергії (потужність, що переноситься хвилею через одиницю площі) описується **вектором Умова — Пойнтінга** $\\vec{S} = \\frac{1}{\\mu_0}[\\vec{E} \\times \\vec{B}]$, а об’ємні густини енергії електричного $w_E = \\frac{1}{2}\\varepsilon_0 E^2$ та магнітного $w_B = \\frac{B^2}{2\\mu_0}$ полів у кожній точці хвилі точно рівні між собою ($w_E = w_B$).'
        ],
        en: [
          'According to James Clerk Maxwell’s electrodynamics, a time-varying magnetic field induces a solenoidal electric field ($\\nabla \\times \\vec{E} = -\\frac{\\partial \\vec{B}}{\\partial t}$), while a time-varying electric displacement current generates a magnetic field ($\\nabla \\times \\vec{B} = \\mu_0\\varepsilon_0 \\frac{\\partial \\vec{E}}{\\partial t}$). Together they sustain a self-propagating **transverse electromagnetic wave** traveling at the speed of light $c = \\frac{1}{\\sqrt{\\varepsilon_0\\mu_0}} \\approx 3\\times 10^8\\text{ m/s}$.',
          'In a plane travelling wave, the electric field $\\vec{E}(x,t) = \\vec{E}_0\\sin(kx - \\omega t)$ and magnetic field $\\vec{B}(x,t) = \\vec{B}_0\\sin(kx - \\omega t)$ oscillate **strictly in phase**, are mutually orthogonal ($\\vec{E} \\perp \\vec{B}$), and form a right-handed triad with the wavevector $\\vec{k}$, with amplitudes linked by $E_0 = c B_0$.',
          'Directional energy flux is given by the **Poynting vector** $\\vec{S} = \\frac{1}{\\mu_0}[\\vec{E} \\times \\vec{B}]$, and the instantaneous electric energy density $w_E = \\frac{1}{2}\\varepsilon_0 E^2$ and magnetic energy density $w_B = \\frac{B^2}{2\\mu_0}$ are equal at every point and instant ($w_E = w_B$).'
        ]
      },
      bernoulli: {
        uk: [
          'Стаціонарний ламінарний потік ідеальної нестисливої рідини ($\\rho = \\text{const}$) у трубі змінного перерізу підпорядковується двом фундаментальним законам. Перший — **рівняння неперервності струменя**: об’ємна витрата рідини $Q_V = S_1 v_1 = S_2 v_2 = \\text{const}$ однакова в кожному перерізі, тому у вузькій горловині труби Вентурі ($S_2 < S_1$) потік прискорюється у $S_1/S_2$ разів.',
          'Другий — **інтеграл Бернуллі** (закон збереження механічної енергії для одиниці об’єму рідини): вздовж лінії течії сума статичного тиску $p$, динамічного (швидкісного) напору $\\frac{1}{2}\\rho v^2$ та гідростатичного тиску $\\rho g h$ є сталою: $p_1 + \\frac{1}{2}\\rho v_1^2 = p_2 + \\frac{1}{2}\\rho v_2^2 = \\text{const}$ (для горизонтальної труби $h_1 = h_2$).',
          'Саме звідси випливає парадоксальний на перший погляд **гідродинамічний ефект Вентурі**: щоб рідина прискорилася при вході у вузьку ділянку ($v_2 > v_1$), на неї має діяти додатний перепад тиску $p_1 - p_2 = \\frac{1}{2}\\rho v_1^2\\!\\left[\\left(\\frac{S_1}{S_2}\\right)^2 - 1\\right] > 0$. Отже, там, де швидкість потоку найбільша, статичний тиск на стінки труби (і рівень рідини у п’єзометричній трубці) є найменшим!'
        ],
        en: [
          'Steady laminar flow of an ideal incompressible fluid ($\\rho = \\text{const}$) through a variable-cross-section pipe obeys two conservation laws. First is the **continuity equation**: volume flow rate $Q_V = S_1 v_1 = S_2 v_2 = \\text{const}$ is invariant along the tube, forcing the fluid to accelerate wherever the cross-section narrows ($S_2 < S_1 \\implies v_2 > v_1$).',
          'Second is **Bernoulli’s equation** (conservation of mechanical energy per unit volume): along any streamline, the sum of static pressure $p$, dynamic pressure $\\frac{1}{2}\\rho v^2$, and hydrostatic head $\\rho g h$ remains constant: $p_1 + \\frac{1}{2}\\rho v_1^2 = p_2 + \\frac{1}{2}\\rho v_2^2 = \\text{const}$ for a horizontal pipe.',
          'This explains the **Venturi effect**: accelerating a fluid parcel into the constriction requires a forward pressure gradient $p_1 - p_2 = \\frac{1}{2}\\rho v_1^2\\!\\left[\\left(\\frac{S_1}{S_2}\\right)^2 - 1\\right] > 0$. Consequently, where flow speed is highest, static pressure against the pipe walls (shown by the manometer column) is lowest!'
        ]
      },
      lens: {
        uk: [
          'Двоопукла збиральна лінза працює як **фазовий трансформатор світлового хвильового фронту**. Оскільки в центрі лінза товстіша, ніж на краях, центральна частина сферичного чи плоского світлового фронту проходить більший шлях у склі з показником заломлення $n > 1$ (де фазова швидкість $v = c/n$ менша) і затримується за фазою відносно периферійних ділянок фронту, перетворюючи розбіжний фронт на збіжний сферичний фронт, що стягується у фокус.',
          'Оптична сила тонкої лінзи у повітрі визначається **формулою лінzовика**: $D = \\frac{1}{F} = (n - 1)\\left(\\frac{1}{R_1} + \\frac{1}{R_2}\\right)$ (в діоптріях, $\\text{дптр} = \\text{м}^{-1}$). Відстань від предмета до лінзи $d$, від лінзи до зображення $f$ та фокусна відстань $F$ пов’язані **формулою тонкої лінзи Гаусса**: $\\frac{1}{d} + \\frac{1}{f} = \\frac{1}{F} \\implies f = \\frac{dF}{d - F}$, а лінійне збільшення становить $\\Gamma = \\frac{H}{h} = \\frac{|f|}{d}$.',
          'Залежно від положення предмета $d$ відносно фокуса $F$ та подвійного фокуса $2F$ змінюється характер зображення: при $d > 2F$ зображення дійсне, обернене і зменшене (як на матриці фотоапарата або сітківці ока); при $F < d < 2F$ — дійсне, обернене і збільшене (проєктор); при $d < F$ промені після лінзи розходяться і око бачить уявне, пряме та збільшене зображення (лупа).'
        ],
        en: [
          'A biconvex converging lens acts as a **spatial phase transformer for light wavefronts**. Because the glass ($n > 1$) is thickest along the optical axis, the central portion of an incident wavefront travels slower ($v = c/n$) over a longer path than the outer edges, bending a diverging or plane wavefront into a converging spherical wavefront.',
          'Optical power $D = 1/F$ (in diopters, $\\text{m}^{-1}$) is given by the **Lensmaker’s equation** $D = (n - 1)\\left(\\frac{1}{R_1} + \\frac{1}{R_2}\\right)$. Object distance $d$, image distance $f$, and focal length $F$ satisfy the **Gaussian thin-lens equation** $\\frac{1}{d} + \\frac{1}{f} = \\frac{1}{F} \\implies f = \\frac{dF}{d - F}$, with lateral magnification $\\Gamma = \\frac{|f|}{d}$.',
          'Varying object distance $d$ relative to $F$ and $2F$ transitions across three optical regimes: for $d > 2F$ the image is real, inverted, and diminished (camera sensor / human eye); for $F < d < 2F$ it is real, inverted, and magnified (projector); and for $d < F$ rays diverge to form a virtual, upright, magnified image (magnifying glass).'
        ]
      },
      lorentz: {
        uk: [
          'На точковий заряд $q$, що рухається зі швидкістю $\\vec{v}$ в однорідному магнітному полі з індукцією $\\vec{B}$, діє магнітна **сила Лоренца**: $\\vec{F}_L = q[\\vec{v} \\times \\vec{B}]$. За визначенням векторного добутку, вектор $\\vec{F}_L$ у кожній точці траєкторії строго перпендикулярний як до ліній поля $\\vec{B}$, так і до миттєвої швидкості $\\vec{v}$. Тому потужність сили Лоренца тотожно дорівнює нулю ($P = \\vec{F}_L \\cdot \\vec{v} = 0$), а **кінетична енергія та модуль швидкості частинки в магнітному полі залишаються незмінними**!',
          'Якщо швидкість $\\vec{v}$ утворює кут $\\alpha$ з вектором $\\vec{B}$, рух розкладається на два незалежні рухи: рівномірний поступальний рух уздовж ліній поля зі швидкістю $v_\\parallel = v\\cos\\alpha = \\text{const}$ та рівномірне обертання в перпендикулярній площині зі швидкістю $v_\\perp = v\\sin\\alpha$. Доцентрове прискорення забезпечується силою Лоренца: $\\frac{mv_\\perp^2}{R} = |q|v_\\perp B$, звідки **ларморівський (циклотронний) радіус** $R = \\frac{mv\\sin\\alpha}{|q|B}$.',
          'Суперпозиція обертання та поздовжнього дрейфу утворює в 3D-просторі **гвинтову лінію (спіраль)**. Період одного оберту $T = \\frac{2\\pi R}{v_\\perp} = \\frac{2\\pi m}{|q|B}$ та циклотронна частота $\\omega_c = \\frac{|q|B}{m}$ (у нерелятивістській границі) не залежать від швидкості частинки, а крок спіралі дорівнює $h = v_\\parallel T = \\frac{2\\pi m v\\cos\\alpha}{|q|B}$. На цьому принципі працюють циклотрони, мас-спектрометри та магнітні пастки плазми.'
        ],
        en: [
          'A point charge $q$ moving at velocity $\\vec{v}$ through a uniform magnetic field $\\vec{B}$ experiences the magnetic **Lorentz force** $\\vec{F}_L = q[\\vec{v} \\times \\vec{B}]$. Because the cross product is always orthogonal to $\\vec{v}$, the mechanical power delivered by the magnetic field is identically zero ($P = \\vec{F}_L \\cdot \\vec{v} = 0$), leaving the particle’s **speed $v$ and kinetic energy strictly constant**!',
          'Decomposing velocity relative to $\\vec{B}$ at pitch angle $\\alpha$ yields uniform drift along the field lines at $v_\\parallel = v\\cos\\alpha = \\text{const}$ and circular motion in the transverse plane at $v_\\perp = v\\sin\\alpha$. Equating centripetal force to Lorentz force gives $\\frac{mv_\\perp^2}{R} = |q|v_\\perp B$, defining the **Larmor (cyclotron) radius** $R = \\frac{mv\\sin\\alpha}{|q|B}$.',
          'Combining circular gyration with parallel drift traces a **3D helix**. Crucially, the cyclotron period $T = \\frac{2\\pi m}{|q|B}$ and frequency $\\omega_c = \\frac{|q|B}{m}$ are independent of particle speed, with helical pitch $h = v_\\parallel T = \\frac{2\\pi m v\\cos\\alpha}{|q|B}$. This governs cyclotrons, mass spectrometers, and magnetic plasma confinement.'
        ]
      },
      faraday: {
        uk: [
          'Явище електромагнітної індукції, відкрите Майклом Фарадеєм у 1831 році, полягає у виникненні вихрового електричного поля та електрорушійної сили (ЕРС індукції $\\mathcal{E}_i$) у замкненому провідному контурі при будь-якій зміні магнітного потоку $\\Phi = \\int \\vec{B}\\cdot d\\vec{S}$ крізь поверхню, обмежену цим контуром.',
          'За **законом Фарадея — Максвелла** з урахуванням $N$ витків котушки, миттєва ЕРС дорівнює швидкості зміни магнітного потоку зі знаком мінус: $\\mathcal{E}_i = -N\\frac{d\\Phi}{dt}$, а індукційний струм у колі з опором $R$ становить $I_i = \\frac{\\mathcal{E}_i}{R}$. Знак мінус математично виражає **правило Ленца**: індукційний струм завжди має такий напрямок, що створене ним власне магнітне поле $\\vec{B}_{\\text{інд}}$ протидіє тій зміні зовнішнього потоку $\\Delta\\Phi$, яка його викликала.',
          'Тому, коли північний полюс магніту наближається до котушки ($\\frac{d\\Phi}{dt} > 0$), котушка обертається до нього однойменним північним полюсом і відштовхує магніт; коли ж магніт віддаляється ($\\frac{d\\Phi}{dt} < 0$), котушка притягує його; а якщо магніт зупинити всередині котушки ($\\frac{d\\Phi}{dt} = 0$), струм миттєво зникає! Саме тому робота зовнішньої сили проти гальмівної сили Ленца перетворюється на електричну та джоулеву енергію $P = I_i^2 R$.'
        ],
        en: [
          'Discovered by Michael Faraday in 1831, electromagnetic induction generates an electromotive force (induced EMF $\\mathcal{E}_i$) around a closed conducting loop whenever the magnetic flux $\\Phi = \\int \\vec{B}\\cdot d\\vec{S}$ threading the loop changes with time.',
          'By **Faraday’s Law** for an $N$-turn coil, $\\mathcal{E}_i = -N\\frac{d\\Phi}{dt}$, driving an induced current $I_i = \\frac{\\mathcal{E}_i}{R}$ through resistance $R$. The minus sign encodes **Lenz’s Law**: the induced current always circulates in a direction whose own magnetic field $\\vec{B}_{\\text{ind}}$ opposes the flux change $\\Delta\\Phi$ that produced it.',
          'Thus, plunging a magnet toward the coil ($\\frac{d\\Phi}{dt} > 0$) induces a repulsive pole that brakes the magnet; pulling it away ($\\frac{d\\Phi}{dt} < 0$) induces an attractive pole; and holding the magnet stationary inside ($\\frac{d\\Phi}{dt} = 0$) yields zero current. Mechanical work done against Lenz’s braking force converts directly into Joule electrical power $P = I_i^2 R$.'
        ]
      },
      kepler: {
        uk: [
          'Рух планет, комет і штучних супутників у центральному полі тяжіння масивного тіла $M$ визначається законом всесвітнього тяжіння Ньютона $\\vec{F} = -G\\frac{Mm}{r^3}\\vec{r}$. Оскільки лінія дії центральної сили завжди проходить через центр Сонця, її момент відносно фокуса дорівнює нулю ($\\vec{M} = [\\vec{r} \\times \\vec{F}] = 0$), а отже, **орбітальний момент імпульсу планети $\\vec{L} = m[\\vec{r} \\times \\vec{v}] = \\text{const}$ строго зберігається**.',
          'Із збереження моменту імпульсу безпосередньо випливає **ІІ закон Кеплера (закон площ)**: площа сектора $dS = \\frac{1}{2}|[\\vec{r} \\times d\\vec{r}]|$, яку замітає радіус-вектор планети за час $dt$, росте з постійною секторною швидкістю $\\frac{dS}{dt} = \\frac{L}{2m} = \\text{const}$. Траєкторією зв’язаного руху ($E < 0$) є еліпс $r(\\theta) = \\frac{a(1 - e^2)}{1 + e\\cos\\theta}$ із великою піввіссю $a$ та ексцентриситетом $e \\in [0, 1)$, у фокусі якого розташоване Сонце.',
          'У **перигелії** (найближчій до Сонця точці, $r_{\\text{min}} = a(1 - e)$) гравітаційна потенціальна енергія $E_p = -\\frac{GMm}{r}$ є мінімальною, а орбітальна швидкість — максимальною: $v_{\\text{p}} = \\sqrt{\\frac{GM}{a}\\frac{1+e}{1-e}}$. В **афелії** ($r_{\\text{max}} = a(1 + e)$) швидкість спадає до $v_{\\text{a}} = \\sqrt{\\frac{GM}{a}\\frac{1-e}{1+e}}$, так що виконується співвідношення $v_{\\text{p}} / v_{\\text{a}} = (1 + e)/(1 - e)$.'
        ],
        en: [
          'Planetary and satellite orbits in the central gravitational field of a body of mass $M$ are governed by Newton’s law of gravitation $\\vec{F} = -G\\frac{Mm}{r^3}\\vec{r}$. Because a central force exerts zero torque about the force center ($\\vec{\\tau} = [\\vec{r} \\times \\vec{F}] = 0$), the planet’s **orbital angular momentum $\\vec{L} = m[\\vec{r} \\times \\vec{v}] = \\text{const}$ is strictly conserved**.',
          'Angular momentum conservation directly implies **Kepler’s Second Law (Law of Equal Areas)**: the areal velocity swept out by the radius vector is constant throughout the orbit, $\\frac{dS}{dt} = \\frac{L}{2m} = \\text{const}$. Every bound orbit ($E < 0$) traces an ellipse $r(\\theta) = \\frac{a(1 - e^2)}{1 + e\\cos\\theta}$ of semi-major axis $a$ and eccentricity $e \\in [0, 1)$ with the Sun at one focus.',
          'At **perihelion** ($r_{\\text{min}} = a(1 - e)$), gravitational potential energy $E_p = -\\frac{GMm}{r}$ is lowest and orbital speed peaks at $v_{\\text{p}} = \\sqrt{\\frac{GM}{a}\\frac{1+e}{1-e}}$. At **aphelion** ($r_{\\text{max}} = a(1 + e)$), speed drops to $v_{\\text{a}} = \\sqrt{\\frac{GM}{a}\\frac{1-e}{1+e}}$, satisfying the exact ratio $v_{\\text{p}} / v_{\\text{a}} = (1 + e)/(1 - e)$.'
        ]
      },
      gyroscope: {
        uk: [
          'Коли осесиметричне тверде тіло масою $m$ і радіусом $R$ котиться без проковзування по похилій площині ($v = \\omega R$), його повна кінетична енергія за теоремою Кеніга складається з енергії поступального руху центра мас $E_{\\text{пост}} = \\frac{1}{2}mv^2$ та енергії обертання навколо власної осі $E_{\\text{об}} = \\frac{1}{2}I\\omega^2$.',
          'Момент інерції тіла зручно записати через **безрозмірний коефіцієнт розподілу маси** $\\beta = \\frac{I}{mR^2}$: для суцільної кулі $\\beta = 0.4$, для суцільного диска чи циліндра $\\beta = 0.5$, а для тонкостінного обруча (труби), де вся маса віддалена на край обода, $\\beta = 1.0$. Тоді закон збереження енергії має вигляд $mgh = \\frac{1}{2}mv^2(1 + \\beta)$, а лінійне прискорення центра мас уздовж схилу дорівнює **$a = \\frac{g\\sin\\alpha}{1 + \\beta}$**.',
          'Зверніть увагу на фундаментальний результат: прискорення кочення $a$ **не залежить ані від маси $m$, ані від радіуса $R$**, а визначається виключно геометрією розподілу маси $\\beta$! Оскільки в обруча $\\beta = 1.0$ рівно половина ($50\\%$) потенціальної енергії витрачається на розкручування обода, а в суцільного диска ($\beta = 0.5$) — лише третина ($33.3\\%$), суцільний диск або куля завжди перемагають обруч у перегонах по схилу.'
        ],
        en: [
          'When an axisymmetric rigid body of mass $m$ and radius $R$ rolls without slipping ($v = \\omega R$) down an incline, König’s theorem states that its total kinetic energy is the sum of translational kinetic energy $E_{\\text{trans}} = \\frac{1}{2}mv^2$ and rotational kinetic energy $E_{\\text{rot}} = \\frac{1}{2}I\\omega^2$.',
          'Expressing the moment of inertia via the **dimensionless shape factor** $\\beta = \\frac{I}{mR^2}$ ($\beta = 0.4$ for a solid sphere, $\\beta = 0.5$ for a solid cylinder/disk, $\\beta = 1.0$ for a thin hoop) gives $E_k = \\frac{1}{2}mv^2(1 + \\beta)$. Conservation of energy $mgh = \\frac{1}{2}mv^2(1 + \\beta)$ yields the linear downhill acceleration **$a = \\frac{g\\sin\\alpha}{1 + \\beta}$**.',
          'Remarkably, the rolling acceleration $a$ is **completely independent of total mass $m$ and radius $R$**, depending only on the mass distribution factor $\\beta$! Because a thin hoop ($\\beta = 1.0$) diverts $50\\%$ of its energy into rotation whereas a solid disk ($\\beta = 0.5$) diverts only $33.3\\%$, the solid disk or sphere always beats the hoop to the bottom.'
        ]
      },
      standingwave: {
        uk: [
          '**Стояча хвиля** утворюється внаслідок інтерференції двох когерентних зустрічних біжучих хвиль однакової амплітуди та частоти, що поширюються вздовж закріпленої на кінцях натягнутої струни довжиною $L$: $y(x,t) = y_+(x - vt) + y_-(x + vt) = A\\sin(kx)\\cos(\\omega t)$. На відміну від біжучої хвилі, стояча хвиля не переносить енергію вздовж струни — енергія замкнена в кожній півхвилі між нерухомими точками.',
          'Граничні умови жорсткого закріплення кінців $y(0,t) = y(L,t) = 0$ вимагають, щоб на довжині струни $L$ укладалося ціле число півхвиль: $L = n\\frac{\\lambda_n}{2}$ ($n = 1, 2, 3, \\dots$). Оскільки фазова швидкість поперечної хвилі в струні з силою натягу $T$ і лінійною густиною $\\mu = m/L$ становить $v = \\sqrt{T/\\mu}$, власні резонансні частоти (гармоніки) утворюють дискретний спектр: **$f_n = \\frac{n}{2L}\\sqrt{\\frac{T}{\\mu}} = n f_1$**.',
          'Мода $n = 1$ називається **основним тоном**, а моди з $n \\ge 2$ — **обертонами**. Кожна $n$-та гармоніка має $n + 1$ нерухомих **вузлів** (де амплітуда завжди нульова, але деформація нахилу максимальна) та $n$ **пучностей** (де швидкість і амплітуда коливань максимальні). Саме спектр обертонів формує тембр усіх струнних музичних інструментів і слугує класичним прототипом квантування рівнів енергії у квантовій механіці.'
        ],
        en: [
          'A **standing wave** forms from the superposition of two coherent counter-propagating waves of equal amplitude and frequency on a string of length $L$ fixed at both ends: $y(x,t) = y_+(x - vt) + y_-(x + vt) = A\\sin(kx)\\cos(\\omega t)$. Unlike a traveling wave, a standing wave does not transport net energy along the string; instead, kinetic and potential energy oscillate locally within each half-wavelength loop.',
          'Boundary conditions $y(0,t) = y(L,t) = 0$ quantize the allowed wavelengths so that an integer number of half-waves fits along $L$: $L = n\\frac{\\lambda_n}{2}$ ($n = 1, 2, 3, \\dots$). With transverse wave speed $v = \\sqrt{T/\\mu}$ set by tension $T$ and linear mass density $\\mu$, the natural frequencies form a discrete harmonic series: **$f_n = \\frac{n}{2L}\\sqrt{\\frac{T}{\\mu}} = n f_1$**.',
          'Mode $n = 1$ is the **fundamental frequency**, while $n \\ge 2$ are **overtones (harmonics)** featuring $n + 1$ stationary **nodes** and $n$ vibrating **antinodes**. This boundary-value quantization underpins musical acoustics and provides the classical wave analogy for quantized electron states in quantum mechanics.'
        ]
      },
      doppler: {
        uk: [
          '**Ефект Доплера** (відкритий Крістіаном Доплером у 1842 р.) полягає в зміні частоти $\\nu$ та довжини хвилі $\\lambda$, які реєструє приймач, коли джерело хвиль та/або спостерігач рухаються відносно хвильового середовища. Фізична причина ефекту наочно видна на 3D-картині сферичних фронтів: кожен наступний гребінь хвилі випромінюється з нової точки простору, куди змістилося джерело за період $T_0 = 1/\\nu_0$.',
          'Попереду джерела, що рухається зі швидкістю $v_s < c_s$, хвильові гребені стискаються: за період $T_0$ фронт проходить шлях $c_s T_0$, а джерело наздоганяє його на $v_s T_0$, тому довжина хвилі зменшується до $\\lambda_{\\text{перед}} = (c_s - v_s)T_0 = \\lambda_0\\!\\left(1 - \\frac{v_s}{c_s}\\right)$, а частота зростає до **$\\nu_{\\text{перед}} = \\frac{\\nu_0}{1 - v_s/c_s}$**. Позаду джерела фронти розтягуються: $\\lambda_{\\text{зад}} = \\lambda_0\\!\\left(1 + \\frac{v_s}{c_s}\\right)$ і частота падає до **$\\nu_{\\text{зад}} = \\frac{\\nu_0}{1 + v_s/c_s}$**.',
          'Відношення швидкості джерела до швидкості хвилі $M = v_s / c_s$ називається **числом Маха**. При наближенні $v_s \\to c_s$ ($M \\to 1$) усі передні хвильові фронти накладаються в одній точці на носі джерела (звуковий бар’єр та ударний конус Маха з півкутом $\\sin\\mu = c_s/v_s$). Ефект Доплера використовується в медичному УЗД кровотоку, метеорадарах та астрофізиці (червоний зсув галактик).'
        ],
        en: [
          'The **Doppler effect** (Christian Doppler, 1842) is the shift in observed frequency $\\nu$ and wavelength $\\lambda$ produced when a wave source moves relative to the propagation medium. The 3D wavefront geometry makes the mechanism transparent: each successive spherical wave crest is emitted from a newly displaced source position separated by $v_s T_0$.',
          'Ahead of a source moving at speed $v_s < c_s$, wave crests crowd together so the wavelength shortens to $\\lambda_{\\text{front}} = (c_s - v_s)T_0 = \\lambda_0\\!\\left(1 - \\frac{v_s}{c_s}\\right)$ and the observed frequency rises to **$\\nu_{\\text{front}} = \\frac{\\nu_0}{1 - v_s/c_s}$**. Behind the source, wavefronts stretch out to $\\lambda_{\\text{back}} = \\lambda_0\\!\\left(1 + \\frac{v_s}{c_s}\\right)$ and the frequency drops to **$\\nu_{\\text{back}} = \\frac{\\nu_0}{1 + v_s/c_s}$**.',
          'The ratio $M = v_s / c_s$ is the **Mach number**. As $M \\to 1$, forward wavefronts pile up constructively into a shock front (sonic boom and Mach cone with half-angle $\\sin\\mu = 1/M$). Doppler shifts are foundational to Doppler ultrasound imaging, weather radar, and cosmological redshift measurements.'
        ]
      },
      brewster: {
        uk: [
          'Оскільки світло є **поперечною електромагнітною хвилею** ($\\vec{E} \\perp \\vec{k}$), вектор електричного поля $\\vec{E}$ може мати певну орієнтацію в площині, перпендикулярній до променя. Природне світло є неполяризованим (хаотична суперпозиція всіх азимутів коливань $\\vec{E}$). Лінійний поляризатор пропускає лише складову електричного поля, паралельну його осі пропускання.',
          'Якщо на аналізатор падає лінійно поляризована хвиля з амплітудою $E_0$ та інтенсивністю $I_0 \\propto E_0^2$, а кут між площиною поляризації променя та віссю аналізатора дорівнює $\\theta$, то крізь аналізатор проходить проєкція амплітуди $E = E_0\\cos\\theta$. Оскільки інтенсивність світла пропорційна квадрату амплітуди поля, отримуємо **закон Малюса**: $I(\\theta) = I_0\\cos^2\\theta$. При схрещених поляризаторах ($\theta = 90^\\circ$) настає повне гасіння світла ($I = 0$).',
          'Поляризація виникає також при відбиванні світла від межі діелектрика з показником заломлення $n$. За **законом Брюстера**, якщо кут падіння задовольняє умову $\\tan\\theta_B = n$ (при цьому відбитий і заломлений промені взаємно перпендикулярні: $\\theta_B + \\gamma = 90^\\circ$), то відбитий промінь стає **повністю лінійно поляризованим** перпендикулярно до площини падіння ($s$-поляризація). Саме це явище використовують у поляризаційних окулярах і фотофільтрах для усунення відблисків.'
        ],
        en: [
          'Because light is a **transverse electromagnetic wave** ($\\vec{E} \\perp \\vec{k}$), the electric field vector $\\vec{E}$ oscillates in the plane perpendicular to propagation. Unpolarized natural light consists of rapidly varying random polarization orientations, whereas a linear polarizer transmits only the component of $\\vec{E}$ parallel to its transmission axis.',
          'When linearly polarized light of amplitude $E_0$ and intensity $I_0 \\propto E_0^2$ encounters a second polarizer (analyzer) rotated by angle $\\theta$, only the projected amplitude $E = E_0\\cos\\theta$ passes through. Since optical intensity scales as the square of the electric field amplitude, the transmitted intensity obeys **Malus’s Law**: $I(\\theta) = I_0\\cos^2\\theta$, vanishing completely when the axes are crossed ($\\theta = 90^\\circ$).',
          'Polarization also occurs by reflection off a dielectric of refractive index $n$. At **Brewster’s angle** $\\tan\\theta_B = n$ (where reflected and refracted rays are orthogonal, $\\theta_B + \\gamma = 90^\\circ$), the $p$-polarized component cannot radiate along the reflection direction, rendering the reflected beam **100% linearly $s$-polarized**—the principle behind anti-glare polarized sunglasses.'
        ]
      },
      diffraction: {
        uk: [
          '**Дифракцією світла** називається сукупність явищ огинання світловим хвильовим фронтом країв перешкод і проникнення світла в область геометричної тіні, що зумовлено хвильовою природою світла. Коли плоский монохроматичний фронт із довжиною хвилі $\\lambda$ проходить крізь вузьку щілину шириною $a$, за принципом Гюйгенса — Френеля кожна елементарна смужка відкритої поверхні щілини стає джерелом вторинних когерентних хвиль.',
          'У дальній зоні (**дифракція Фраунгофера**) вторинні промені, що йдуть під кутом $\\theta$, мають максимальну різницю ходу між лівим і правим краями щілини $\\Delta = a\\sin\\theta$. Розбиваючи щілину на парне число $2m$ зон Френеля шириною $\\frac{a}{2m}$, бачимо, що при **$a\\sin\\theta = \\pm m\\lambda$** ($m = 1, 2, 3, \\dots$) кожні дві сусідні зони гасять одна одну в протифазі, утворюючи **дифракційні мінімуми**. Повний розподіл інтенсивності описується функцією $I(\\theta) = I_0\\!\\left(\\frac{\\sin\\beta}{\\beta}\\right)^2$, де $\\beta = \\frac{\\pi a\\sin\\theta}{\\lambda}$.',
          'Майже вся світлова енергія ($\\approx 84\\%$) зосереджена в центральному дифракційному максимумі між першими мінімумами $\\sin\\theta_1 = \\pm \\frac{\\lambda}{a}$, лінійна ширина якого на екрані становить $W = \\frac{2\\lambda L}{a}$. Виникає фундаментальний хвильовий парадокс (аналог співвідношення невизначеностей Гейзенберга): **що вужчою ми робимо щілину $a$, то ширше розпливається світлова смуга на екрані!**'
        ],
        en: [
          '**Diffraction** is the bending and spreading of a wave as it passes through an aperture or around an obstacle, violating geometric ray optics whenever the aperture width $a$ is comparable to the wavelength $\\lambda$. By the Huygens–Fresnel principle, every infinitesimal strip across the open slit of width $a$ radiates coherent secondary wavelets.',
          'In the far-field (**Fraunhofer diffraction**) at angle $\\theta$, the path difference between wavelets from the two slit edges is $\\Delta = a\\sin\\theta$. Dividing the slit into $2m$ equal zones shows that destructive cancellation occurs at **diffraction minima $a\\sin\\theta = \\pm m\\lambda$** ($m = 1, 2, 3, \\dots$). Integrating across the continuous aperture gives the intensity profile $I(\\theta) = I_0\\!\\left(\\frac{\\sin\\beta}{\\beta}\\right)^2$, where $\\beta = \\frac{\\pi a\\sin\\theta}{\\lambda}$.',
          'Over $84\\%$ of the diffracted light power is concentrated in the central bright maximum bounded by $\\sin\\theta_1 = \\pm \\frac{\\lambda}{a}$, with screen width $W = \\frac{2\\lambda L}{a}$. This reveals a fundamental wave reciprocity: **narrowing the slit $a$ causes the diffracted beam on the screen to spread wider!**'
        ]
      },
      carnot: {
        uk: [
          'Будь-яка теплова машина перетворює частину тепла $Q_1$, отриманого робочим тілом від нагрівника з температурою $T_1$, на корисну механічну роботу $A = Q_1 - Q_2$, передаючи залишок тепла $Q_2$ холодильнику з температурою $T_2 < T_1$. За **ІІ началом термодинаміки** (у формулюванні Томсона — Планка) неможливо створити періодично діючий двигун, який би повністю перетворював теплоту $Q_1$ на роботу без передачі частини тепла $Q_2$ холодному джерелу.',
          'У 1824 році Саді Карно довів, що серед усіх циклічних машин, які працюють між заданими температурами $T_1$ і $T_2$, максимальний коефіцієнт корисної дії (ККД) має оборотний **цикл Карно**, що складається з двох ізотерм ($T_1 = \\text{const}$ і $T_2 = \\text{const}$) та двох адіабат ($\\delta Q = 0$, $PV^\\gamma = \\text{const}$). Для ідеального газу корисна робота за цикл становить $A = \\nu R (T_1 - T_2)\\ln\\frac{V_2}{V_1}$, а граничний ККД дорівнює **$\\eta_{\\text{Карно}} = 1 - \\frac{T_2}{T_1}$**.',
          'Теорема Карно встановлює фундаментальну межу енергетики: ККД ідеальної машини **не залежить від природи робочого тіла**, а визначається лише відношенням абсолютних температур холодильника й нагрівника $T_2/T_1$. Щоб підвищити $\\eta$, інженери прагнуть максимально підняти температуру згоряння палива $T_1$ у турбінах та знизити температуру конденсатора $T_2$.'
        ],
        en: [
          'A heat engine operates cyclically between a hot reservoir at absolute temperature $T_1$ and a cold sink at $T_2 < T_1$, absorbing heat $Q_1$, performing net mechanical work $W = Q_1 - Q_2 = \\oint P\\,dV$, and rejecting waste heat $Q_2$. By the **Second Law of Thermodynamics** (Kelvin–Planck statement), no cyclic engine can convert $100\\%$ of absorbed heat into work ($Q_2 > 0$).',
          'In 1824, Sadi Carnot proved that the maximum possible efficiency between temperatures $T_1$ and $T_2$ is achieved by a reversible **Carnot cycle** comprising two isotherms ($T_1 = \\text{const}$, $T_2 = \\text{const}$) and two adiabats ($\\delta Q = 0$, $PV^\\gamma = \\text{const}$). For an ideal gas, net cycle work is $W = \\nu R (T_1 - T_2)\\ln\\frac{V_2}{V_1}$, and the thermal efficiency is **$\\eta_{\\text{Carnot}} = 1 - \\frac{T_2}{T_1}$**.',
          'Carnot’s theorem establishes an universal thermodynamic bound: maximum efficiency is **independent of the working substance** and depends solely on the absolute temperature ratio $T_2/T_1$. Raising turbine inlet temperature $T_1$ and lowering exhaust temperature $T_2$ is the primary route to higher efficiency in power engineering.'
        ]
      },
      viscosity: {
        uk: [
          'Коли тверда сферична кулька радіусом $r$ і густиною $\\rho_s$ опускається у в’язкій рідині густиною $\\rho_f$ за малих чисел Рейнольдса ($\\text{Re} = \\frac{2\\rho_f v r}{\\eta} \\ll 1$), обтікання є плавним і ламінарним (без відриву вихорів). Причиною внутрішнього тертя рідини є перенесення імпульсу між сусідніми шарами, що рухаються з різними швидкостями.',
          'Джордж Габріель Стокс (1851 р.), розв’язавши рівняння гідродинаміки Нав’є — Стокса для повільного обтікання сфери, вивів формулу сили в’язкого опору (**закон Стокса**): $\\vec{F}_c = -6\\pi \\eta r \\vec{v}$, де $\\eta$ — динамічна в’язкість рідини (у $\\text{Па}\\cdot\\text{с}$). Рівняння руху кульки вздовж вертикалі має вигляд $m\\frac{dv}{dt} = (\\rho_s - \\rho_f)\\frac{4}{3}\\pi r^3 g - 6\\pi \\eta r v$.',
          'На початку падіння ($v \\approx 0$) кулька прискорюється, але зі зростанням швидкості сила Стокса $F_c \\propto v$ лінійно збільшується, поки повністю не зрівноважить ефективну вагу кульки у рідині ($F_{\\text{тяж}} = F_A + F_c$). Після цього прискорення стає нульовим і встановлюється **гранична (термінальна) швидкість осідання**: $v_{\\text{терм}} = \\frac{2 r^2 g (\\rho_s - \\rho_f)}{9\\eta}$. Цей метод лежить в основі віскозиметра Стокса та знаменитого досліду Міллікена з вимірювання заряду електрона.'
        ],
        en: [
          'When a rigid sphere of radius $r$ and density $\\rho_s$ settles through a viscous fluid of density $\\rho_f$ at low Reynolds number ($\\text{Re} = \\frac{2\\rho_f v r}{\\eta} \\ll 1$), the flow remains smooth and laminar (creeping flow). Internal fluid friction arises from momentum diffusion across adjacent shearing fluid layers.',
          'By solving the linearized Navier–Stokes equations around a sphere, George Gabriel Stokes (1851) derived **Stokes’ Law** for viscous drag: $\\vec{F}_d = -6\\pi \\eta r \\vec{v}$, where $\\eta$ is the dynamic viscosity (in $\\text{Pa}\\cdot\\text{s}$). Vertical motion is governed by $m\\frac{dv}{dt} = (\\rho_s - \\rho_f)\\frac{4}{3}\\pi r^3 g - 6\\pi \\eta r v$.',
          'As the sphere accelerates from rest, viscous drag $F_d \\propto v$ grows until it exactly balances net gravity minus buoyancy ($F_g = F_A + F_d$). Acceleration then vanishes and the sphere descends at constant **terminal velocity** $v_{\\text{term}} = \\frac{2 r^2 g (\\rho_s - \\rho_f)}{9\\eta}$, scaling as $r^2$. This relationship underpins falling-sphere viscometry and Millikan’s oil-drop experiment.'
        ]
      },
      coulomb: {
        uk: [
          'Фундаментальний закон електростатики, встановлений Шарлем Кулоном у 1785 році за допомогою крутильних терезів, стверджує: сила взаємодії двох нерухомих точкових зарядів $q_1$ та $q_2$ у вакуумі прямо пропорційна добутку модулів зарядів, обернено пропорційна квадрату відстані $r$ між ними і напрямлена вздовж прямої, що їх з’єднує: $F = k\\frac{|q_1 q_2|}{r^2}$, де $k = \\frac{1}{4\\pi\\varepsilon_0} \\approx 8.988\\times 10^9\\text{ Н}\\cdot\\text{м}^2/\\text{Кл}^2$.',
          'Електричне поле системи зарядів підпорядковується **принципу суперпозиції**: у кожній точці простору вектор напруженості $\\vec{E} = \\sum_i \\vec{E}_i = \\sum_i \\frac{1}{4\\pi\\varepsilon_0}\\frac{q_i}{r_i^3}\\vec{r}_i$, а скалярний електростатичний потенціал дорівнює алгебраїчній сумі $\\varphi = \\sum_i \\frac{1}{4\\pi\\varepsilon_0}\\frac{q_i}{r_i}$. Потенціальна енергія взаємодії двох зарядів становить $W_p = \\frac{k q_1 q_2}{r}$ (додатна для однойменних зарядів і від’ємна для різнойменних).',
          'Система двох рівних за модулем і протилежних за знаком зарядів $+q$ і $-q$ на відстані $d$ утворює **електричний диполь** із дипольним моментом $\\vec{p} = q\\vec{d}$. Силові лінії поля $\\vec{E}$ завжди починаються на додатних зарядах і закінчуються на від’ємних, ніколи не перетинаються і в кожній точці ортогональні до еквіпотенціальних поверхонь ($\\vec{E} = -\\nabla\\varphi$).'
        ],
        en: [
          'Established by Charles-Augustin de Coulomb in 1785 using a torsion balance, **Coulomb’s Law** states that the electrostatic force between two stationary point charges $q_1$ and $q_2$ in vacuum is proportional to the product of their charges and inversely proportional to the square of their separation $r$: $F = k\\frac{|q_1 q_2|}{r^2}$, where $k = \\frac{1}{4\\pi\\varepsilon_0} \\approx 8.988\\times 10^9\\text{ N}\\cdot\\text{m}^2/\\text{C}^2$.',
          'Electrostatic fields obey the **superposition principle**: at any point in space, the net electric field vector is $\\vec{E} = \\sum_i \\frac{1}{4\\pi\\varepsilon_0}\\frac{q_i}{r_i^3}\\vec{r}_i$ and the scalar potential is the algebraic sum $\\varphi = \\sum_i \\frac{1}{4\\pi\\varepsilon_0}\\frac{q_i}{r_i}$. The electrostatic potential energy of the pair is $W_p = \\frac{k q_1 q_2}{r}$ (positive for like charges, negative for opposite charges).',
          'Two opposite charges $+q$ and $-q$ separated by distance $d$ form an **electric dipole** with dipole moment $\\vec{p} = q\\vec{d}$. Field lines originate on positive charges, terminate on negative charges, never cross, and are everywhere orthogonal to equipotential surfaces ($\\vec{E} = -\\nabla\\varphi$).'
        ]
      },
      rlccircuit: {
        uk: [
          'Коливальний контур $RLC$, що складається з конденсатора ємністю $C$, котушки індуктивності $L$ та активного опору $R$, є повною електродинамічною аналогією механічного пружинного маятника з тертям. Роль координати зміщення $x$ відіграє заряд на обкладках конденсатора $q(t)$, роль швидкості $\\dot{x}$ — сила струму $I(t) = \\dot{q}$, роль маси $m$ — індуктивність $L$ («інерція» струму через ЕРС самоіндукції $\\mathcal{E}_s = -L\\dot{I}$), а роль жорсткості $k$ — обернена ємність $1/C$.',
          'За другим правилом Кірхгофа $U_L + U_R + U_C = 0$, що дає диференціальне рівняння вільних коливань: **$L\\ddot{q} + R\\dot{q} + \\frac{1}{C}q = 0$**. За відсутності опору ($R = 0$) у контурі відбуваються незатухаючі гармонічні коливання з власною частотою $\\omega_0 = \\frac{1}{\\sqrt{LC}}$ і періодом, який визначається **формулою Томсона (Кельвіна)**: $T_0 = 2\\pi\\sqrt{LC}$.',
          'Чотири рази за період відбувається взаємне перетворення енергії електричного поля конденсатора $W_E = \\frac{q^2}{2C} = \\frac{1}{2}CU^2$ на енергію магнітного поля котушки $W_B = \\frac{1}{2}LI^2$. Струм $I(t)$ випереджає заряд $q(t)$ за фазою на $\\pi/2$: коли конденсатор повністю розряджений ($q = 0$), струм і магнітне поле в котушці досягають максимуму. При $R > 0$ енергія поступово розсіюється як джоулеве тепло $P = I^2 R$ з коефіцієнтом загасання $\\beta = \\frac{R}{2L}$.'
        ],
        en: [
          'A series $RLC$ circuit comprising capacitance $C$, inductance $L$, and resistance $R$ is the exact electrodynamic dual of a damped mechanical oscillator. Capacitor charge $q(t)$ corresponds to displacement $x$, current $I(t) = \\dot{q}$ to velocity $\\dot{x}$, inductance $L$ to mass $m$ (via self-induced EMF $\\mathcal{E}_L = -L\\dot{I}$), and inverse capacitance $1/C$ to spring stiffness $k$.',
          'Kirchhoff’s voltage loop rule $U_L + U_R + U_C = 0$ yields the second-order differential equation **$L\\ddot{q} + R\\dot{q} + \\frac{1}{C}q = 0$**. In an ideal lossless LC tank ($R = 0$), charge oscillates harmonically at natural angular frequency $\\omega_0 = \\frac{1}{\\sqrt{LC}}$ with **Thomson’s period** $T_0 = 2\\pi\\sqrt{LC}$.',
          'Four times per period, energy sloshes between the capacitor’s electric field $W_E = \\frac{q^2}{2C} = \\frac{1}{2}CU^2$ and the inductor’s magnetic field $W_B = \\frac{1}{2}LI^2$. Because $I = \\dot{q}$, current leads charge in phase by $\\pi/2$. With nonzero resistance ($R > 0$), amplitude decays exponentially at rate $\\beta = \\frac{R}{2L}$ as electromagnetic energy dissipates into Joule heat $P = I^2 R$.'
        ]
      },
      atwood: {
        uk: [
          'Машина Атвуда, винайдена Джорджем Атвудом у 1784 році, є класичним приладом для прецизійного дослідження законів динаміки Ньютона в умовах «сповільненої гравітації». Два вантажі масами $m_1$ і $m_2$, зв’язані нерозтяжною ниткою, перекинутою через блок радіусом $R$ і масою $M_p$, рухаються з однаковим за модулем лінійним прискоренням $a = \\varepsilon R$.',
          'Запишемо ІІ закон Ньютона для кожного вантажу та основне рівняння динаміки обертального руху для блока з моментом інерції $I = \\frac{1}{2}M_p R^2$: $m_1 g - T_1 = m_1 a$, $T_2 - m_2 g = m_2 a$ та $(T_1 - T_2)R = I\\varepsilon = \\frac{1}{2}M_p R a$. Додаючи ці три рівняння, отримуємо точну формулу прискорення системи: **$a = \\frac{(m_1 - m_2)g}{m_1 + m_2 + \\frac{1}{2}M_p}$**.',
          'Зверніть увагу на принципову деталь: якщо блок має масу ($M_p > 0$), сили натягу нитки по обидва боки блока **не рівні між собою** ($T_1 > T_2$ при $m_1 > m_2$), бо саме різниця моментів $(T_1 - T_2)R$ розкручує масивний шків! Підбираючи близькі маси $m_1 \\approx m_2$, можна зробити прискорення $a \\ll g$ як завгодно малим і детально виміряти закон рівноприскореного руху $h = \\frac{1}{2}at^2$.'
        ],
        en: [
          'Invented by George Atwood in 1784, Atwood’s machine is a classic apparatus for verifying Newton’s laws of motion under “diluted gravity.” Two masses $m_1$ and $m_2$ connected by an inextensible cord over a pulley of radius $R$ and mass $M_p$ share a common linear acceleration $a = \\alpha R$.',
          'Writing Newton’s second law for both masses and the rotational torque equation for the solid disk pulley ($I = \\frac{1}{2}M_p R^2$) gives $m_1 g - T_1 = m_1 a$, $T_2 - m_2 g = m_2 a$, and $(T_1 - T_2)R = I\\alpha = \\frac{1}{2}M_p R a$. Summing the three equations yields the system acceleration **$a = \\frac{(m_1 - m_2)g}{m_1 + m_2 + \\frac{1}{2}M_p}$**.',
          'Notice a crucial physical insight: whenever the pulley has inertia ($M_p > 0$), the cord tensions on the two sides **are not equal** ($T_1 \\neq T_2$), because a net torque $(T_1 - T_2)R$ is required to angularly accelerate the pulley! Choosing $m_1 \\approx m_2$ slows the motion ($a \\ll g$) for accurate timing.'
        ]
      },
      coriolis: {
        uk: [
          'Закони Ньютона у класичному вигляді виконуються лише в **інерціальних системах відліку (ІСВ)**. Якщо ж ми спостерігаємо за рухом кульки з неінерціальної платформи, яка рівномірно обертається з кутовою швидкістю $\\vec{\\Omega}$, то в рівнянні руху відносно диска з’являються дві сили інерції: відцентрова сила $\\vec{F}_{\\text{відц}} = -m[\\vec{\\Omega} \\times [\\vec{\\Omega} \\times \\vec{r}]]$ та **сила Коріоліса** $\\vec{F}_C = -2m[\\vec{\\Omega} \\times \\vec{v}_{\\text{відн}}]$.',
          'В інерціальній системі лабораторного столу (погляньте на пряму пунктирну лінію в 3D-сцені!) кулька, запущена з центра диска без тертя зі швидкістю $v_r$, рухається **строго прямолінійно і рівномірно**. Проте за час $t = r / v_r$ сам диск повертається на кут $\\Delta\\varphi = \\Omega t$, тому на поверхні диска кулька залишає вигнутий слід — **спіраль Архімеда** $\\varphi(r) = -\\frac{\\Omega}{v_r}r$ з поперечним відхиленням на краю $s \\approx \\Omega v_r t^2$.',
          'Оскільки векторний добуток $-2m[\\vec{\\Omega} \\times \\vec{v}_{\\text{відн}}]$ у Північній півкулі Землі ($\Omega_z > 0$) спрямований праворуч від вектора відносної швидкості $\\vec{v}_{\\text{відн}}$, сила Коріоліса відхиляє вітри, морські течії та річки в Північній півкулі праворуч (підмивання правих берегів — закон Бера), закручує циклони проти годинникової стрілки та зумовлює поворот площини коливань маятника Фуко.'
        ],
        en: [
          'Newton’s laws take their standard form only in **inertial reference frames**. When observing motion from a rotating non-inertial platform with angular velocity $\\vec{\\Omega}$, two fictitious inertial forces appear in the rotating frame: the centrifugal force $\\vec{F}_{\\text{cf}} = -m[\\vec{\\Omega} \\times [\\vec{\\Omega} \\times \\vec{r}]]$ and the **Coriolis force** $\\vec{F}_C = -2m[\\vec{\\Omega} \\times \\vec{v}_{\\text{rel}}]$.',
          'In the stationary laboratory frame (shown by the straight dashed reference line in 3D), a frictionless puck launched radially outward at speed $v_r$ moves in a **perfect straight line**. Meanwhile, the turntable rotates beneath it through angle $\\Delta\\varphi = \\Omega t$, so the trace scribed on the disk forms an **Archimedean spiral** $\\varphi(r) = -\\frac{\\Omega}{v_r}r$ with lateral deflection $s \\approx \\Omega v_r t^2$.',
          'Because $-2m[\\vec{\\Omega} \\times \\vec{v}_{\\text{rel}}]$ acts perpendicular to $\\vec{v}_{\\text{rel}}$, it performs no work ($\\vec{F}_C \\cdot \\vec{v}_{\\text{rel}} = 0$) yet deflects trajectories to the right in the Northern Hemisphere ($\\Omega_z > 0$), driving cyclonic weather systems, ocean gyres, and the precession of Foucault’s pendulum.'
        ]
      },
      hooke: {
        uk: [
          'Класична формула Гука $F = k\\Delta L$ залежить від геометричних розмірів конкретного стрижня (його довжини $L_0$ та площі поперечного перерізу $S$). Щоб сформулювати закон пружності як фундаментальну властивість самого матеріалу, Томас Юнг увів поняття **механічної напруги** $\\sigma = \\frac{F}{S}$ (у паскалях, $\\text{Па} = \\text{Н/м}^2$) та **відносного видовження** $\\varepsilon = \\frac{\\Delta L}{L_0}$ (безрозмірна величина або у відсотках).',
          'У межах пружних деформацій механічна напруга прямо пропорційна відносному видовженню (**закон Гука в диференціальній формі**): $\\sigma = E\\varepsilon$, звідки абсолютне видовження стрижня дорівнює $\\Delta L = \\frac{F L_0}{E S}$, а еквівалентна жорсткість $k = \\frac{ES}{L_0}$. Коефіцієнт пропорційності $E$ називається **модулем Юнга** і характеризує опір кристалічної ґратки матеріалу розтягу або стиску (наприклад, для гуми $E \\sim 0.01\\text{ ГПа}$, для алюмінію $E \\approx 70\\text{ ГПа}$, для сталі $E \\approx 200\\text{ ГПа}$).',
          'Об’ємна густина потенціальної енергії пружно деформованого стрижня дорівнює площі під діаграмою розтягу $\\sigma(\\varepsilon)$: $w = \\frac{1}{2}\\sigma\\varepsilon = \\frac{1}{2}E\\varepsilon^2 = \\frac{\\sigma^2}{2E}$, а повна накопичена пружна енергія становить $E_p = \\frac{1}{2}F\\Delta L$. При розтягу стрижень також зазнає поперечного стиснення (коефіцієнт Пуассона $\\nu = -\\varepsilon_\\perp / \\varepsilon_\\parallel$), що відображено в 3D-деформації зразка.'
        ],
        en: [
          'While the elementary spring formula $F = k\\Delta L$ depends on specimen dimensions, continuum mechanics expresses elasticity entirely in terms of intrinsic material quantities: **normal mechanical stress** $\\sigma = \\frac{F}{S}$ (in Pascals, $\\text{Pa} = \\text{N/m}^2$) and **dimensionless longitudinal strain** $\\varepsilon = \\frac{\\Delta L}{L_0}$.',
          'Within the proportional elastic limit, stress varies linearly with strain (**Hooke’s Law in differential form**): $\\sigma = E\\varepsilon$, yielding total elongation $\\Delta L = \\frac{F L_0}{E S}$ and effective axial stiffness $k = \\frac{ES}{L_0}$. The material constant $E$ is **Young’s modulus**, measuring interatomic bond stiffness (ranging from $\\sim 0.01\\text{ GPa}$ in elastomers to $70\\text{ GPa}$ in aluminum and $200\\text{ GPa}$ in structural steel).',
          'Elastic strain energy stored per unit volume equals the area under the stress–strain curve: $w = \\frac{1}{2}\\sigma\\varepsilon = \\frac{1}{2}E\\varepsilon^2 = \\frac{\\sigma^2}{2E}$, with total potential energy $E_p = \\frac{1}{2}F\\Delta L$. Axial stretching is accompanied by lateral Poisson contraction ($\\varepsilon_\\perp = -\\nu\\varepsilon_\\parallel$), visible on the 3D tensile specimen.'
        ]
      },
      torricelli: {
        uk: [
          'У 1643 році учень Галілея Еванджеліста Торрічеллі встановив дивовижний факт: швидкість витікання струменя ідеальної рідини з малого бічного отвору у відкритій посудині на глибині $h$ під вільною поверхнею точно дорівнює швидкості, якої набуло б будь-яке тверде тіло при вільному падінні у вакуумі з тієї самої висоти $h$: **$v = \\sqrt{2gh}$**.',
          'Строге доведення формули Торрічеллі випливає з **рівняння Бернуллі**, записаного для лінії течії від вільної поверхні резервуара (переріз $S_1$, висота $H$, атмосферний тиск $p_0$) до вихідного сопла (переріз $S_2 \\ll S_1$, висота $y = H - h$, де струмінь у повітрі також перебуває під атмосферним тиском $p_0$): $p_0 + \\rho g H + \\frac{1}{2}\\rho v_1^2 = p_0 + \\rho g (H - h) + \\frac{1}{2}\\rho v_2^2$. Оскільки при $S_2 \\ll S_1$ швидкість опускання рівня $v_1 = v_2(S_2/S_1) \\approx 0$, густина рідини $\\rho$ скорочується і ми отримуємо $v_2 = \\sqrt{2gh}$.',
          'Виходячи горизонтально з сопла на висоті $y = H - h$ від основи зі швидкістю $v = \\sqrt{2gh}$, струмінь падає за час $t = \\sqrt{2(H - h)/g}$ і б’є на горизонтальну відстань **$L(h) = v t = 2\\sqrt{h(H - h)}$**. Ця функція симетрична відносно заміни $h \\leftrightarrow H - h$ і досягає абсолютного максимуму **$L_{\\text{max}} = H$** рівно посередині висоти стовпа рідини ($h = H/2$).'
        ],
        en: [
          'In 1643, Evangelista Torricelli discovered that the efflux speed of an ideal liquid jet emerging from a small orifice at depth $h$ below the free surface equals the speed a body would acquire in free fall from height $h$: **$v = \\sqrt{2gh}$**.',
          'Torricelli’s theorem follows directly from **Bernoulli’s equation** applied along a streamline from the wide free surface (area $S_1$, elevation $H$, pressure $p_0$) to the exit nozzle (area $S_2 \\ll S_1$, elevation $H - h$, also at atmospheric pressure $p_0$): $p_0 + \\rho g H + \\frac{1}{2}\\rho v_1^2 = p_0 + \\rho g (H - h) + \\frac{1}{2}\\rho v_2^2$. Since $v_1 = v_2(S_2/S_1) \\approx 0$ for a wide tank, fluid density $\\rho$ cancels out, leaving $v_2 = \\sqrt{2gh}$.',
          'Launching horizontally from height $H - h$ above the base, the jet falls for time $t = \\sqrt{2(H - h)/g}$ and strikes at horizontal range **$L(h) = v t = 2\\sqrt{h(H - h)}$**. By symmetry, maximum range **$L_{\\text{max}} = H$** occurs when the nozzle is placed exactly at mid-depth ($h = H/2$).'
        ]
      },
      maxwell: {
        uk: [
          'Хоча середня кінетична енергія молекул газу однозначно задається температурою $T$, унаслідок безперервних випадкових зіткнень окремі молекули мають найрізноманітніші швидкості — від майже нульових до надзвукових. У 1859 році Джеймс Клерк Максвелл вивів фундаментальну функцію густини ймовірності модулів швидкостей молекул у стані термодинамічної рівноваги: **$f(v) = 4\\pi\\!\\left(\\frac{M}{2\\pi R T}\\right)^{\\!3/2} v^2 \\exp\\!\\left(-\\frac{M v^2}{2 R T}\\right)$**.',
          'Структура розподілу Максвелла визначається конкуренцією двох множників: параболічного множника $v^2$ (об’єм сферичного шару $4\\pi v^2 dv$ у просторі швидкостей, через який частка зовсім повільних молекул прямує до нуля) та експоненціального больцманівського множника $\\exp\\!\\left(-\\frac{\\varepsilon_k}{k_B T}\\right)$, що обмежує ймовірність великих енергій.',
          'Розподіл характеризується трьома строго впорядкованими характерними швидкостями ($v_{\\text{імов}} < \\langle v \\rangle < v_{\\text{кв}}$): 1) **найбільш імовірна швидкість** (максимум купола $df/dv = 0$) $v_{\\text{імов}} = \\sqrt{\\frac{2RT}{M}}$; 2) **середня арифметична швидкість** $\\langle v \\rangle = \\sqrt{\\frac{8RT}{\\pi M}} \\approx 1.128\\,v_{\\text{імов}}$; 3) **середня квадратична швидкість** (що визначає тиск і внутрішню енергію газу) $v_{\\text{кв}} = \\sqrt{\\frac{3RT}{M}} \\approx 1.225\\,v_{\\text{імов}}$. При нагріванні або зменшенні молярної маси $M$ (перехід від $\\text{Xe}$ до $\\text{He}$) крива зміщується праворуч і розширюється за умови нормування $\\int_0^\\infty f(v)\\,dv = 1$.'
        ],
        en: [
          'Although temperature $T$ fixes the mean kinetic energy of an ideal gas, incessant molecular collisions spread individual molecular speeds across a wide spectrum. In 1859, James Clerk Maxwell derived the equilibrium speed probability density function: **$f(v) = 4\\pi\\!\\left(\\frac{M}{2\\pi R T}\\right)^{\\!3/2} v^2 \\exp\\!\\left(-\\frac{M v^2}{2 R T}\\right)$**.',
          'The shape of the Maxwell–Boltzmann curve arises from the product of the phase-space shell volume factor $4\\pi v^2$ (which suppresses $f(v) \\to 0$ as $v \\to 0$) and the Boltzmann exponential factor $\\exp\\!\\left(-\\frac{Mv^2}{2RT}\\right)$ (which suppresses high-energy tails).',
          'Three characteristic speeds obey the invariant ordering $v_p < \\langle v \\rangle < v_{\\text{rms}}$: 1) **most probable speed** (peak of $f(v)$) $v_p = \\sqrt{\\frac{2RT}{M}}$; 2) **mean speed** $\\langle v \\rangle = \\sqrt{\\frac{8RT}{\\pi M}} \\approx 1.128\\,v_p$; and 3) **root-mean-square speed** $v_{\\text{rms}} = \\sqrt{\\frac{3RT}{M}} \\approx 1.225\\,v_p$. Raising temperature $T$ or choosing a lighter gas $M$ shifts the peak rightward and lowers its height while preserving total probability $\\int_0^\\infty f(v)\\,dv = 1$.'
        ]
      },
      newtonrings: {
        uk: [
          '**Кільця Ньютона** — класичний приклад інтерференції світла «рівної товщини», що виникає при відбиванні монохроматичного пучка від тонкого повітряного клина між плоскою скляною пластиною та опуклою сферичною лінзою великого радіуса кривини $R \\gg r$. На відстані $r$ від точки дотику товщина повітряного прошарку за теоремою Піфагора $(R - d)^2 + r^2 = R^2$ становить **$d(r) \\approx \\frac{r^2}{2R}$**.',
          'Перший промінь відбивається від верхньої межі «скло — повітря» (від середовища з меншим показником заломлення) без зміни фази. Другий промінь проходить крізь повітряний шар висотою $d(r)$ і відбивається від нижньої межі «повітря — скло» (від оптично густішого середовища $n_{\\text{скла}} > n_{\\text{пов}}$), де за формулами Френеля **фаза хвилі стрибком змінюється на $\\pi$**, що еквівалентно втраті півхвилі $\\frac{\\lambda}{2}$. Тому повна оптична різниця ходу дорівнює **$\\Delta(r) = 2d(r) + \\frac{\\lambda}{2} = \\frac{r^2}{R} + \\frac{\\lambda}{2}$**.',
          'У точці дотику лінзи і пластини ($r = 0$, $d = 0$) різниця ходу становить $\\Delta = \\frac{\\lambda}{2}$ (протифаза!), тому **в центрі кілець Ньютона у відбитому світлі завжди спостерігається темна пляма**! Радіуси $m$-х темних кілець ($\Delta = (2m + 1)\\frac{\\lambda}{2}$) дорівнюють $r_{\\text{темн},m} = \\sqrt{m\\lambda R}$, а світлих кілець — $r_{\\text{світл},m} = \\sqrt{(m - \\tfrac{1}{2})\\lambda R}$.'
        ],
        en: [
          '**Newton’s rings** are equal-thickness interference fringes formed in the thin air film trapped between a plano-convex lens of large curvature radius $R \\gg r$ and an optical flat. At radial distance $r$ from the contact point, the air-gap thickness follows from $(R - d)^2 + r^2 = R^2$ as **$d(r) \\approx \\frac{r^2}{2R}$**.',
          'Wave 1 reflects at the upper glass-to-air interface (higher to lower index) with zero phase shift. Wave 2 traverses the air gap twice ($2d(r)$) and reflects at the lower air-to-glass interface (lower to higher index), where Fresnel’s equations dictate an abrupt **$\\pi$ phase inversion** equivalent to an extra $\\frac{\\lambda}{2}$ path difference. Total optical path difference is therefore **$\\Delta(r) = 2d(r) + \\frac{\\lambda}{2} = \\frac{r^2}{R} + \\frac{\\lambda}{2}$**.',
          'At the central point of contact ($r = 0$, $d = 0$), the $\\lambda/2$ phase reversal leaves the two reflected rays exactly out of phase, producing a **central dark spot** in reflected light! Dark ring radii satisfy $r_{\\text{dark},m} = \\sqrt{m\\lambda R}$ and bright ring radii satisfy $r_{\\text{bright},m} = \\sqrt{(m - \\tfrac{1}{2})\\lambda R}$.'
        ]
      },
      photoelectric: {
        uk: [
          'Зовнішній фотоефект — явище виривання електронів із поверхні металу під дією електромагнітного випромінювання (відкрите Г. Герцем і детально досліджене О. Столєтовим та Ф. Ленардом). Класична хвильова електродинаміка не змогла пояснити, чому максимальна кінетична енергія фотоелектронів **не залежить від інтенсивності світла**, а визначається лише його частотою $\\nu$, і чому існує порогова «червона межа» $\\nu_{\\text{min}} = A_{\\text{вих}}/h$.',
          'У 1905 році Альберт Ейнштейн пояснив ці закони, розвинувши квантову гіпотезу Планка: світло випромінюється і поглинається дискретними квантами (**фотонами**) з енергією $E_\\gamma = h\\nu = \\frac{hc}{\\lambda}$, де $h = 6.626\\times 10^{-34}\\text{ Дж}\\cdot\\text{с}$. Поглинаючи один фотон, електрон витрачає енергію на подолання **роботи виходу** $A_{\\text{вих}}$ з металу, а залишок переходить у його максимальну кінетичну енергію (**рівняння Ейнштейна для фотоефекту**): $h\\nu = A_{\\text{вих}} + E_{k,\\text{max}}$.',
          'Якщо подати на анод затримувальну напругу $U < 0$, фотострум припиниться при **затримувальному потенціалі** $U_z$, коли робота поля $e U_z = E_{k,\\text{max}} = \\frac{hc}{\\lambda} - A_{\\text{вих}}$. Збільшення ж інтенсивності світла (потоку фотонів при $\\lambda < \\lambda_{\\text{кр}}$) пропорційно збільшує кількість вирваних за секунду електронів (силу фотоструму насичення $I_{\\text{нас}}$), не змінюючи швидкості жодного окремого електрона.'
        ],
        en: [
          'The external photoelectric effect—emission of electrons from a metal surface illuminated by light—defied classical wave electrodynamics, which could not explain why maximum photoelectron kinetic energy is **independent of light intensity** and why emission ceases abruptly above a threshold wavelength $\\lambda_{\\text{max}} = hc / W$.',
          'In 1905, Albert Einstein resolved the paradox by proposing that light consists of discrete energy quanta (**photons**) of energy $E_\\gamma = h\\nu = \\frac{hc}{\\lambda}$, where $h = 6.626\\times 10^{-34}\\text{ J}\\cdot\\text{s}$ is Planck’s constant. A single electron absorbs one photon, expends the metal’s **work function** $W$ to escape the surface barrier, and retains maximum kinetic energy given by **Einstein’s photoelectric equation**: $h\\nu = W + E_{k,\\text{max}}$.',
          'Applying a reverse bias halts the photocurrent at the **stopping potential** $U_s$, where $e U_s = E_{k,\\text{max}} = \\frac{hc}{\\lambda} - W$. Increasing optical intensity (for $\\lambda < \\lambda_{\\text{max}}$) increases the photon flux and saturation photocurrent $I_{\\text{sat}}$ proportionally without altering $E_{k,\\text{max}}$.'
        ]
      },
      rutherford: {
        uk: [
          'До 1911 року панівною була «пудингова модель» атома Дж. Дж. Томсона, де додатний заряд вважався рівномірно розмазаним по всьому об’єму атома ($R_{\\text{ат}} \\sim 10^{-10}\\text{ м}$). У такій моделі важкі $\\alpha$-частинки ($q_\\alpha = +2e$) повинні були б пролітати крізь золоту фольгу майже без відхилення ($\\theta < 1^\\circ$). Проте досліди Ернеста Резерфорда, Ганса Гейгера та Ернеста Марсдена виявили, що частина $\\alpha$-частинок розсіюється на великі кути $\\theta > 90^\\circ$ і навіть відскакує назад!',
          'Це довело, що весь додатний заряд $Ze$ і майже вся маса атома ($99.97\\%$) зосереджені в надзвичайно малому **атомному ядрі** радіусом $R_{\\text{ядра}} \\sim 10^{-15}\\text{ м}$. Під дією кулонівської сили відштовхування $F(r) = \\frac{1}{4\\pi\\varepsilon_0}\\frac{2Ze^2}{r^2}$ $\\alpha$-частинка з початковою енергією $E_\\alpha$ та **прицільним параметром** $b$ рухається по гіперболі, а кут розсіяння визначається **формулою Резерфорда**: $\\cot\\!\\left(\\frac{\\theta}{2}\\right) = \\frac{4\\pi\\varepsilon_0 E_\\alpha b}{Z e^2} = \\frac{2b}{d_{\\text{min}}}$.',
          'При лобовому наближенні ($b \\to 0$, $\\theta \\to 180^\\circ$) уся кінетична енергія переходить у кулонівську потенціальну енергію на мінімальній відстані $d_{\\text{min}} = \\frac{2Ze^2}{4\\pi\\varepsilon_0 E_\\alpha}$, що дозволило Резерфорду вперше оцінити верхню межу розміру атомного ядра і створити **планетарну модель атома**.'
        ],
        en: [
          'Before 1911, J. J. Thomson’s “plum-pudding” model pictured positive charge spread diffusely across the entire atomic volume ($R_{\\text{atom}} \\sim 10^{-10}\\text{ m}$), predicting that fast $\\alpha$-particles ($q_\\alpha = +2e$) would traverse thin gold foil with negligible deflection ($\\theta < 1^\\circ$). Instead, Ernest Rutherford, Hans Geiger, and Ernest Marsden observed rare $\\alpha$-particles scattering through large angles $\\theta > 90^\\circ$!',
          'Rutherford concluded that all positive charge $+Ze$ and $99.97\\%$ of atomic mass reside in a tiny central **atomic nucleus** ($R_{\\text{nuc}} \\sim 10^{-15}\\text{ m}$). Repelled by the inverse-square Coulomb force $F(r) = \\frac{1}{4\\pi\\varepsilon_0}\\frac{2Ze^2}{r^2}$, an $\\alpha$-particle of kinetic energy $E_\\alpha$ and **impact parameter** $b$ follows a hyperbolic trajectory with scattering angle given by **Rutherford’s formula**: $\\cot\\!\\left(\\frac{\\theta}{2}\\right) = \\frac{4\\pi\\varepsilon_0 E_\\alpha b}{Z e^2} = \\frac{2b}{d_{\\text{min}}}$.',
          'In a head-on collision ($b \\to 0$, $\\theta \\to 180^\\circ$), kinetic energy converts entirely into electrostatic potential energy at the distance of closest approach $d_{\\text{min}} = \\frac{2Ze^2}{4\\pi\\varepsilon_0 E_\\alpha}$, establishing the **planetary nuclear model of the atom**.'
        ]
      },
      ampere: {
        uk: [
          'У 1820 році Андре-Марі Ампер виявив фундаментальну електродинамічну взаємодію між двома паралельними прямолінійними провідниками зі струмами $I_1$ та $I_2$, розташованими на відстані $d$ один від одного. Ця взаємодія відбувається не безпосередньо на відстані, а **через магнітне поле**: перший струм $I_1$ за законом Біо — Савара — Лапласа створює навколо себе концентричні лінії магнітної індукції $B_1 = \\frac{\\mu_0 I_1}{2\\pi d}$ (напрямок визначається правилом правого гвинта).',
          'Другий провідник довжиною $L$ зі струмом $I_2$, перебуваючи в магнітному полі $\\vec{B}_1$, зазнає дії **сили Ампера** $\\vec{F}_{12} = I_2 [\\vec{L} \\times \\vec{B}_1]$. Отже, на кожну ділянку провідників довжиною $L$ діє сила взаємодії **$F = \\frac{\\mu_0 I_1 I_2 L}{2\\pi d}$**, де $\\mu_0 = 4\\pi\\times 10^{-7}\\text{ Гн/м}$ — магнітна стала.',
          'За правилом лівої руки (або векторного добутку $\\vec{I}_2 \\times (\\vec{I}_1 \\times \\vec{r}_{12})$): **співнапрямлені паралельні струми притягуються**, а **протилежно напрямлені — відштовхуються**! Саме цей дослід історично використовувався в Міжнародній системі одиниць SI для еталонного означення одиниці сили струму — $1\\text{ Ампера}$ (при $I_1 = I_2 = 1\\text{ А}$ і $d = 1\\text{ м}$ погонна сила становить рівно $2\\times 10^{-7}\\text{ Н/м}$).'
        ],
        en: [
          'In 1820, André-Marie Ampère discovered the mechanical force between two parallel straight conductors carrying currents $I_1$ and $I_2$ separated by distance $d$. The interaction is mediated by the **magnetic field**: wire 1 generates concentric magnetic field lines of magnitude $B_1 = \\frac{\\mu_0 I_1}{2\\pi d}$ at the location of wire 2 (right-hand grip rule).',
          'Wire 2 of length $L$ carrying current $I_2$ in field $\\vec{B}_1$ experiences the **Ampère force** $\\vec{F}_{12} = I_2 [\\vec{L} \\times \\vec{B}_1]$, yielding a mutual force of magnitude **$F = \\frac{\\mu_0 I_1 I_2 L}{2\\pi d}$**, where $\\mu_0 = 4\\pi\\times 10^{-7}\\text{ H/m}$ is the vacuum permeability.',
          'Evaluating the double cross product $\\vec{I}_2 \\times (\\vec{I}_1 \\times \\vec{r}_{12})$ proves that **parallel currents in the same direction attract**, whereas **antiparallel currents repel**! Historically, this exact configuration defined the SI base unit of electric current, the **Ampere** ($2\\times 10^{-7}\\text{ N/m}$ at $d = 1\\text{ m}$).'
        ]
      },
      hall: {
        uk: [
          '**Ефект Холла** (відкритий Едвіном Холлом у 1879 р.) виникає, коли пластинку провідника чи напівпровідника товщиною $d$ і шириною $w$, крізь яку тече поздовжній струм $I = |q|n v_d w d$, поміщають у перпендикулярне магнітне поле $\\vec{B}$. На носії заряду $q$, що дрейфують зі швидкістю $\\vec{v}_d$, діє поперечна магнітна сила Лоренца $\\vec{F}_B = q[\\vec{v}_d \\times \\vec{B}]$, яка відхиляє їх до однієї з бічних граней пластинки.',
          'Накопичення зарядів на бічних гранях створює поперечне електростатичне поле Холла $\\vec{E}_H$. В усталеному режимі електрична сила $q\\vec{E}_H$ повністю зрівноважує магнітну силу Лоренца ($|q|E_H = |q|v_d B \\implies E_H = v_d B$), і подальше бокове розділення зарядів припиняється. Між бічними гранями встановлюється **холлівська різниця потенціалів (ЕРС Холла)**: $U_H = E_H w = v_d B w = \\frac{I B}{n |q| d} = R_H \\frac{I B}{d}$, де $R_H = \\frac{1}{nq}$ — **стала Холла**.',
          'Ефект Холла має унікальне значення у фізиці твердого тіла: 1) за величиною $U_H$ безпосередньо вимірюють **концентрацію вільних носіїв заряду $n$**; 2) за полярністю напруги $U_H$ визначають **знак носіїв струму** (електронна провідність $n$-типу чи діркова провідність $p$-типу), бо і негативні електрони ($q = -e$, $\\vec{v}_d$ проти струму), і позитивні дірки ($q = +e$, $\\vec{v}_d$ за струмом) відхиляються силою Лоренца до однієї й тієї самої бічної грані, заряджаючи її протилежними знаками!'
        ],
        en: [
          'Discovered by Edwin Hall in 1879, the **Hall effect** occurs when a conducting or semiconducting slab of thickness $d$ and width $w$ carrying longitudinal current $I = |q|n v_d w d$ is placed in a perpendicular magnetic field $\\vec{B}$. Charge carriers $q$ drifting at velocity $\\vec{v}_d$ experience a transverse Lorentz force $\\vec{F}_B = q[\\vec{v}_d \\times \\vec{B}]$ that deflects them toward one lateral edge.',
          'Charge accumulation on the side faces builds up a transverse electrostatic Hall field $\\vec{E}_H$ until electric force balances magnetic deflection ($|q|E_H = |q|v_d B \\implies E_H = v_d B$). The resulting steady-state **Hall voltage** across width $w$ is **$U_H = E_H w = v_d B w = \\frac{I B}{n |q| d} = R_H \\frac{I B}{d}$**, where $R_H = \\frac{1}{nq}$ is the **Hall coefficient**.',
          'The Hall effect is a cornerstone of solid-state physics and sensor engineering: 1) measuring $U_H$ directly reveals the **carrier concentration $n$**; 2) the polarity of $U_H$ unambiguously identifies the **sign of the majority charge carriers** ($n$-type electrons vs. $p$-type holes), since both are deflected to the same side of the slab!'
        ]
      },
      coupled: {
        uk: [
          'Два однакові математичні маятники масою $m$ і довжиною $L$, з’єднані легкою пружиною жорсткості $k$, утворюють класичну **лінійну коливальну систему з двома ступенями вільності**: $m\\ddot{x}_1 = -\\frac{mg}{L}x_1 - k(x_1 - x_2)$ та $m\\ddot{x}_2 = -\\frac{mg}{L}x_2 - k(x_2 - x_1)$. Коливання одного маятника деформують пружину і періодично підштовхують другий маятник.',
          'Перехід до **нормальних координат** $q_+ = x_1 + x_2$ та $q_- = x_1 - x_2$ розщеплює зв’язану систему на дві незалежні **нормальні моди**: 1) **синфазну моду** ($x_1 = x_2$), де пружина не розтягується і частота дорівнює $\\omega_1 = \\sqrt{\\frac{g}{L}}$; 2) **протифазну моду** ($x_1 = -x_2$), де пружина стискається вдвічі сильніше і частота зростає до $\\omega_2 = \\sqrt{\\frac{g}{L} + \\frac{2k}{m}}$.',
          'Якщо відхилити лише перший маятник ($x_1(0) = A$, $x_2(0) = 0$), збуджується рівна суперпозиція обох нормальних мод: $x_1(t) = A\\cos\\!\\left(\\frac{\\omega_2 - \\omega_1}{2}t\\right)\\cos(\\bar{\\omega}t)$ та $x_2(t) = A\\sin\\!\\left(\\frac{\\omega_2 - \\omega_1}{2}t\\right)\\sin(\\bar{\\omega}t)$. Виникає **явище биття**: з періодом повного перекачування енергії **$T_{\\text{биття}} = \\frac{2\\pi}{\\omega_2 - \\omega_1}$** перший маятник повністю зупиняється, віддаючи $100\\%$ своєї енергії другому, після чого процес повторюється у зворотному напрямку!'
        ],
        en: [
          'Two identical pendulums of mass $m$ and length $L$ coupled by a horizontal spring of stiffness $k$ form a canonical **two-degree-of-freedom coupled oscillator**: $m\\ddot{x}_1 = -\\frac{mg}{L}x_1 - k(x_1 - x_2)$ and $m\\ddot{x}_2 = -\\frac{mg}{L}x_2 - k(x_2 - x_1)$.',
          'Transforming to **normal coordinates** $q_+ = x_1 + x_2$ and $q_- = x_1 - x_2$ diagonalizes the equations into two independent **normal modes**: 1) the **in-phase symmetric mode** ($x_1 = x_2$), where the coupling spring remains unstretched and $\\omega_1 = \\sqrt{\\frac{g}{L}}$; 2) the **out-of-phase antisymmetric mode** ($x_1 = -x_2$), where the spring stretches by $2x_1$ and raises the frequency to $\\omega_2 = \\sqrt{\\frac{g}{L} + \\frac{2k}{m}}$.',
          'Displacing only pendulum 1 at $t = 0$ excites an equal superposition of both normal modes: $x_1(t) = A\\cos\\!\\left(\\frac{\\omega_2 - \\omega_1}{2}t\\right)\\cos(\\bar{\\omega}t)$ and $x_2(t) = A\\sin\\!\\left(\\frac{\\omega_2 - \\omega_1}{2}t\\right)\\sin(\\bar{\\omega}t)$. This produces **energy beats**: with beat period **$T_{\\text{beat}} = \\frac{2\\pi}{\\omega_2 - \\omega_1}$**, pendulum 1 comes to a complete halt while transferring $100\\%$ of its energy to pendulum 2, and then back again!'
        ]
      },
      precession: {
        uk: [
          'Чому важка дзиґа або гіроскоп, вісь якої нахилена під кутом $\\theta$ до вертикалі, не падає вниз під дією сили тяжіння, а натомість плавно описує конус у горизонтальній площині? Відповідь дає **основне рівняння динаміки обертального руху у векторній формі**: швидкість зміни вектора моменту імпульсу тіла дорівнює вектору моменту зовнішніх сил $\\frac{d\\vec{L}}{dt} = \\vec{M}$.',
          'Масивний ротор, розкручений із великою кутовою швидкістю $\\omega_s$, має потужний власний момент імпульсу $\\vec{L} = I\\vec{\\omega}_s$, спрямований уздовж осі симетрії дзиґи. Сила тяжіння $m\\vec{g}$, прикладена в центрі мас на відстані $l$ від точки опори $O$, створює відносно $O$ момент сили $\\vec{M} = [\\vec{r} \\times m\\vec{g}]$ модулем $M = mgl\\sin\\theta$, який за правилом правого гвинта **перпендикулярний до вертикальної площини нахилу осі** (тобто горизонтальний і ортогональний до $\\vec{L}$!).',
          'Оскільки приріст $d\\vec{L} = \\vec{M}\\,dt$ перпендикулярний до самого вектора $\\vec{L}$, він не змінює його довжину, а лише повертає кінець вектора $\\vec{L}$ по горизонтальному колу радіуса $L\\sin\\theta$. Кутова швидкість цієї регулярної **гіроскопічної прецесії** дорівнює **$\\Omega_p = \\frac{M}{L\\sin\\theta} = \\frac{mgl}{I\\omega_s}$**: що швидше крутиться ротор $\\omega_s$, то повільніше і стабільніше прецесує гіроскоп!'
        ],
        en: [
          'Why does a rapidly spinning heavy top tilted at angle $\\theta$ not topple under gravity, instead sweeping its axis around a horizontal circle? The answer lies in the **vector torque–angular-momentum theorem**: the time rate of change of angular momentum equals the external torque vector, $\\frac{d\\vec{L}}{dt} = \\vec{\\tau}$.',
          'A rotor with moment of inertia $I$ spinning rapidly at $\\omega_s$ carries a large spin angular momentum $\\vec{L} = I\\vec{\\omega}_s$ directed along its symmetry axis. Gravity $m\\vec{g}$ acting at distance $l$ from the pivot $O$ exerts a torque $\\vec{\\tau} = [\\vec{r} \\times m\\vec{g}]$ of magnitude $\\tau = mgl\\sin\\theta$ that points **horizontally and perpendicular to $\\vec{L}$**.',
          'Because the infinitesimal increment $d\\vec{L} = \\vec{\\tau}\\,dt$ is orthogonal to $\\vec{L}$, it rotates the direction of $\\vec{L}$ around the vertical axis without changing its tilt angle $\\theta$. The angular velocity of this **gyroscopic precession** is **$\\Omega_p = \\frac{\\tau}{L\\sin\\theta} = \\frac{mgl}{I\\omega_s}$**: spinning the rotor faster ($\\omega_s \\uparrow$) makes the precession slower and more stable!'
        ]
      },
      magnus: {
        uk: [
          '**Ефект Магнуса** (описаний Генріхом Магнусом у 1852 р.) — це виникнення поперечної підіймальної (або бічної) сили $\\vec{F}_M$, що діє на тіло (циліндр, м’яч, снаряд), яке одночасно рухається поступально в потоці газу чи рідини зі швидкістю $\\vec{v}_\\infty$ та обертається навколо власної осі з кутовою швидкістю $\\vec{\\omega}$.',
          'Через в’язке прилипання граничного шару повітря обертовий циліндр радіусом $R$ створює навколо себе вихрову **циркуляцію швидкості** $\\Gamma = \\oint \\vec{v}\\cdot d\\vec{l} = 2\\pi R^2 \\omega$. На тій стороні циліндра, де лінійна швидкість поверхні $\\omega R$ збігається з напрямком набігаючого потоку $v_\\infty$, швидкості додаються ($v_{\\text{верх}} = v_\\infty + \\omega R$); на протилежній стороні потік гальмується ($v_{\\text{низ}} = v_\\infty - \\omega R$). За **рівнянням Бернуллі** $p + \\frac{1}{2}\\rho v^2 = \\text{const}$, там, де швидкість більша, статичний тиск менший ($p_{\\text{верх}} < p_{\\text{низ}}$)!',
          'Інтегрування різниці тисків по поверхні циліндра довжиною $L$ дає **теорему Жуковського — Кутти**: підіймальна сила на одиницю розмаху дорівнює добутку густини середовища $\\rho$, швидкості потоку $v_\\infty$ та циркуляції $\\Gamma$: **$F_M = \\rho v_\\infty \\Gamma L = 2\\pi \\rho R^2 L \\omega v_\\infty$**. Саме ефект Магнуса змушує підкручений футбольний чи тенісний м’яч закручуватися в польоті по дузі й використовується в турбовітрилах суден Флеттнера.'
        ],
        en: [
          'The **Magnus effect** (Heinrich Gustav Magnus, 1852) is the generation of a transverse aerodynamic lift force $\\vec{F}_M$ on a spinning cylinder or sphere moving through a fluid of density $\\rho$ at freestream velocity $\\vec{v}_\\infty$.',
          'Through boundary-layer entrainment, a cylinder of radius $R$ spinning at angular speed $\\omega$ establishes a net **velocity circulation** $\\Gamma = \\oint \\vec{v}\\cdot d\\vec{l} = 2\\pi R^2 \\omega$. On the side where surface rotation moves with the freestream, flow speeds add ($v_{\\text{top}} = v_\\infty + \\omega R$); on the opposite side, flow is retarded ($v_{\\text{bot}} = v_\\infty - \\omega R$). By **Bernoulli’s theorem** $p + \\frac{1}{2}\\rho v^2 = \\text{const}$, higher velocity produces lower static pressure ($p_{\\text{top}} < p_{\\text{bot}}$)!',
          'Integrating pressure around a cylinder of span $L$ yields the **Kutta–Joukowski lift theorem**: **$F_M = \\rho v_\\infty \\Gamma L = 2\\pi \\rho R^2 L \\omega v_\\infty$**, directed along $\\vec{\\omega} \\times \\vec{v}_\\infty$. This mechanism explains curved trajectories of spinning soccer, tennis, and baseballs as well as Flettner rotor ships.'
        ]
      },
      capillary: {
        uk: [
          'Молекули поверхневого шару рідини притягуються сусідніми молекулами зсередини об’єму сильніше, ніж розрідженими молекулами пари ззовні, тому вільна поверхня рідини має надлишкову вільну енергію $E_s = \\sigma S$ і поводиться як натягнута пружна плівка з **коефіцієнтом поверхневого натягу** $\\sigma$ (у $\\text{Н/м}$ або $\\text{Дж/м}^2$). Якщо притягання молекул рідини до стінок вузької трубки сильніше за взаємне притягання молекул рідини (**змочування**, крайовий кут $\\theta < 90^\\circ$, як у води на чистому склі), утворюється увігнутий меніск; при **незмочуванні** ($\theta > 90^\\circ$, як у ртуті на склі) меніск є опуклим.',
          'Викривлена сферична поверхня меніска радіусом $R_m = \\frac{r}{\\cos\\theta}$ (де $r$ — внутрішній радіус капіляра) створює під собою додатковий стрибок тиску за **формулою Юнга — Лапласа**: $\\Delta p = \\frac{2\\sigma}{R_m} = \\frac{2\\sigma\\cos\\theta}{r}$. При змочуванні ($\cos\\theta > 0$) тиск у рідині безпосередньо під увігнутим меніском менший за атмосферний на величину $\\Delta p$, тому зовнішній атмосферний тиск вдавлює стовпчик рідини вгору по капіляру.',
          'Підйом триває доти, доки гідростатичний тиск піднятого стовпа $\\rho g h$ не зрівноважить капілярний перепад Лапласа ($\rho g h = \\frac{2\\sigma\\cos\\theta}{r}$), звідки отримуємо **формулу Жюрена**: **$h = \\frac{2\\sigma\\cos\\theta}{\\rho g r}$**. Отже, висота капілярного підйому обернено пропорційна радіусу трубки $r$, що забезпечує живлення рослин, рух вологи в ґрунтах і пористих матеріалах.'
        ],
        en: [
          'Molecules at a liquid–gas interface experience an inward cohesive pull from bulk neighbors, endowing the surface with excess free energy $E_s = \\sigma S$ characterized by **surface tension** $\\sigma$ ($\text{N/m}$). When liquid–solid adhesion exceeds liquid–liquid cohesion (**wetting**, contact angle $\\theta < 90^\\circ$, such as water in clean glass), a concave meniscus forms; when cohesion dominates (**non-wetting**, $\\theta > 90^\\circ$, such as mercury in glass), the meniscus is convex.',
          'In a cylindrical capillary tube of inner radius $r$, the spherical meniscus of radius of curvature $R_m = \\frac{r}{\\cos\\theta}$ sustains a pressure jump across the interface given by the **Young–Laplace equation**: $\\Delta p = \\frac{2\\sigma}{R_m} = \\frac{2\\sigma\\cos\\theta}{r}$.',
          'Equating this Laplace capillary suction to the hydrostatic pressure $\\rho g h$ of the liquid column yields **Jurin’s Law**: **$h = \\frac{2\\sigma\\cos\\theta}{\\rho g r}$** (positive rise for $\\theta < 90^\\circ$, capillary depression for $\\theta > 90^\\circ$). Because $h \\propto 1/r$, narrower capillaries draw liquids to dramatically greater heights, driving sap transport in plants and wicking in porous media.'
        ]
      },
      brownian: {
        uk: [
          '**Броунівський рух** (відкритий ботаніком Робертом Броуном у 1827 р.) — це невпинний хаотичний зигзагоподібний рух мікроскопічних зважених частинок (пилку, колоїдних кульок радіусом $r \\sim 0.1\\text{–}1\\text{ мкм}$) у рідині або газі. Через малий розмір броунівської частинки імпульси мільйонів теплових ударів молекул рідини з різних боків у кожен малий інтервал часу **не компенсують один одного**, створюючи випадкову флуктуаційну силу Ланжевена $\\vec{F}_{\\text{фл}}(t)$.',
          'Оскільки всі напрямки теплових поштовхів рівноймовірні, середній вектор зміщення частинки дорівнює нулю ($\langle \\vec{r}(t) \\rangle = 0$). Проте середній квадрат відстані частинки від початкової точки не зануляється! У 1905 році Альберт Ейнштейн і Маріан Смолуховський довели фундаментальний закон дифузії: **середній квадрат зміщення прямо пропорційний часу спостереження $t$**: $\\langle r^2(t) \\rangle = 2 d_{\\text{вим}} D t$ (для 2D-площини $\\langle r^2 \\rangle = 4Dt$, для 3D-простору $\\langle r^2 \\rangle = 6Dt$).',
          'Коефіцієнт дифузії $D$ визначається **співвідношенням Ейнштейна — Стокса**: **$D = \\frac{k_B T}{6\\pi \\eta r} = \\frac{R T}{6\\pi \\eta r N_A}$**, яке пов’язує макроскопічну в’язкість $\\eta$ і температуру $T$ зі сталою Авогадро $N_A$. Блискучі експерименти Жана Перрена (1908 р.) з вимірювання $\\langle r^2 \\rangle$ броунівських кульок гумігуту підтвердили формулу Ейнштейна і стали остаточним прямим доказом реального існування атомів і молекул!'
        ],
        en: [
          '**Brownian motion** (discovered by Robert Brown in 1827) is the perpetual, erratic random walk executed by microscopic suspended particles ($r \\sim 0.1\\text{–}1\\text{ }\\mu\\text{m}$) immersed in a fluid. Because the particle’s surface area is small, the incessant thermal impacts of surrounding fluid molecules do not cancel out instantaneously, subjecting the particle to a fluctuating Langevin force $\\vec{F}_{\\text{fl}}(t)$.',
          'By isotropy, the mean displacement vector vanishes ($\\langle \\vec{r}(t) \\rangle = 0$), yet the particle steadily wanders away from its origin! In 1905, Albert Einstein and Marian Smoluchowski proved that the **mean-squared displacement (MSD) grows linearly with time $t$**: $\\langle r^2(t) \\rangle = 2 d_{\\text{dim}} D t$ ($\langle r^2 \\rangle = 4Dt$ in a 2D plane; $\langle r^2 \\rangle = 6Dt$ in 3D space).',
          'The diffusion coefficient $D$ obeys the **Stokes–Einstein relation** **$D = \\frac{k_B T}{6\\pi \\eta r} = \\frac{R T}{6\\pi \\eta r N_A}$**, linking thermal energy $k_B T$ to viscous dissipation $6\\pi\\eta r$. Jean Perrin’s 1908 measurements of $\\langle r^2(t) \\rangle$ yielded a precise value of Avogadro’s number $N_A$ and provided definitive proof of the physical reality of atoms.'
        ]
      },
      michelson: {
        uk: [
          '**Інтерферометр Майкельсона** (створений Альбертом Майкельсоном у 1881 р.) — це прецизійний двопроменевий оптичний прилад, у якому когерентний пучок світла з довжиною хвилі $\\lambda$ ділиться напівпрозорим світлодільником $BS$ (під кутом $45^\\circ$) на два взаємно перпендикулярні плеча $L_1$ та $L_2$. Відбившись від плоских дзеркал $M_1$ (рухомого за допомогою мікрометричного гвинта) та $M_2$ (нерухомого), обидва промені знову зводяться світлодільником на фотодетектор або екран спостереження.',
          'Оскільки промінь у першому плечі проходить додаткове зміщення рухомого дзеркала $\\Delta d$ **двічі** (туди і назад), зміна положення дзеркала $M_1$ на величину $\\Delta d$ створює оптичну різницю ходу **$\\Delta = 2\\Delta d$** та фазовий зсув $\\Delta\\varphi = \\frac{2\\pi}{\\lambda}(2\\Delta d) = \\frac{4\\pi \\Delta d}{\\lambda}$. Інтенсивність у центрі інтерференційної картини змінюється за законом $I(\\Delta d) = I_{\\text{max}}\\cos^2\\!\\left(\\frac{2\\pi \\Delta d}{\\lambda}\\right)$.',
          'Таким чином, зсув дзеркала лише на **чверть довжини хвилі** ($\\Delta d = \\lambda/4$) змінює різницю ходу на $\\lambda/2$ і переводить світлий максимум у темний мінімум, а зсув на $\\Delta d = \\lambda/2$ зсуває картину рівно на одну повну смугу ($N = \\frac{2\\Delta d}{\\lambda}$). Інтерферометр Майкельсона спростував гіпотезу «світового ефіру» (дослід Майкельсона — Морлі 1887 р., що проклав шлях до СТВ Ейнштейна) і лежить в основі лазерних детекторів гравітаційних хвиль LIGO.'
        ],
        en: [
          'Invented by Albert A. Michelson in 1881, the **Michelson interferometer** splits a coherent monochromatic light beam of wavelength $\\lambda$ at a $45^\\circ$ beam splitter ($BS$) into two orthogonal arms of lengths $L_1$ and $L_2$. After reflecting off mirrors $M_1$ (micrometer-adjustable) and $M_2$ (fixed), the beams recombine at $BS$ and interfere on the detector screen.',
          'Because light traverses arm 1 **twice** (out and back), translating mirror $M_1$ by distance $\\Delta d$ changes the round-trip optical path length by **$\\Delta = 2\\Delta d$**, introducing a phase shift $\\Delta\\varphi = \\frac{4\\pi \\Delta d}{\\lambda}$. Central fringe intensity varies as $I(\\Delta d) = I_{\\text{max}}\\cos^2\\!\\left(\\frac{2\\pi \\Delta d}{\\lambda}\\right)$.',
          'Consequently, moving mirror $M_1$ by just a **quarter-wavelength** ($\\Delta d = \\lambda/4$) flips a bright maximum into a dark minimum, and every $\\Delta d = \\lambda/2$ shifts the pattern by one full fringe ($N = \\frac{2\\Delta d}{\\lambda}$). This design powered the historic 1887 Michelson–Morley experiment and forms the optical core of the LIGO gravitational-wave observatories.'
        ]
      },
      compton: {
        uk: [
          'У 1923 році Артур Комптон досліджував розсіяння жорсткого рентгенівського та $\\gamma$-випромінювання на легких речовинах (графіті) і виявив, що розсіяне під кутом $\\theta$ випромінювання має **більшу довжину хвилі** $\\lambda\' > \\lambda_0$, причому зсув $\\Delta\\lambda = \\lambda\' - \\lambda_0$ не залежить від матеріалу мішені, а визначається виключно кутом розсіяння $\\theta$. У межах класичної електродинаміки Томсона (де електрон розгойдується полем хвилі і випромінює на тій самій частоті $\\lambda\' = \\lambda_0$) пояснити це явище було неможливо.',
          'Комптон розрахував процес як **пружне релятивістське зіткнення** корпускули-фотона з енергією $E_0 = \\frac{hc}{\\lambda_0}$ та імпульсом $p_0 = \\frac{h}{\\lambda_0}$ із майже вільним нерухомим електроном (енергія спокою $m_e c^2 \\approx 511\\text{ кеВ}$). Із релятивістських законів збереження енергії $E_0 + m_e c^2 = E\' + \\sqrt{p_e^2 c^2 + m_e^2 c^4}$ та векторного імпульсу $\\vec{p}_0 = \\vec{p}\' + \\vec{p}_e$ випливає знаменита **формула Комптона**: **$\\Delta\\lambda = \\lambda\' - \\lambda_0 = \\lambda_C (1 - \\cos\\theta)$**.',
          'Фундаментальна константа $\\lambda_C = \\frac{h}{m_e c} \\approx 2.426\\text{ пм}$ ($2.426\\times 10^{-12}\\text{ м}$) називається **комптонівською довжиною хвилі електрона**. При розсіянні назад ($\\theta = 180^\\circ$, $\\cos\\theta = -1$) фотон передає електрону віддачі максимальну частку своєї енергії, а його довжина хвилі зростає на подвійну комптонівську величину $\\Delta\\lambda_{\\text{max}} = 2\\lambda_C \\approx 4.85\\text{ пм}$. Дослід Комптона став вирішальним доказом того, що фотон переносить не лише квант енергії $h\\nu$, а й реальний механічний імпульс $\\vec{p} = \\hbar\\vec{k}$.'
        ],
        en: [
          'In 1923, Arthur Holly Compton observed that X-rays scattered by electrons in graphite through angle $\\theta$ emerge with a **longer wavelength** $\\lambda\' > \\lambda_0$, where the wavelength shift $\\Delta\\lambda = \\lambda\' - \\lambda_0$ depends solely on the scattering angle $\\theta$. Classical Thomson scattering (which predicts $\\lambda\' = \\lambda_0$) could not account for this shift.',
          'Treating the interaction as a **relativistic elastic billiard collision** between a photon of energy $E_0 = \\frac{hc}{\\lambda_0}$ and momentum $p_0 = \\frac{h}{\\lambda_0}$ and a stationary electron of rest energy $m_e c^2 \\approx 511\\text{ keV}$, conservation of relativistic 4-momentum ($E_0 + m_e c^2 = E\' + \\sqrt{p_e^2 c^2 + m_e^2 c^4}$ and $\\vec{p}_0 = \\vec{p}\' + \\vec{p}_e$) yields **Compton’s scattering formula**: **$\\Delta\\lambda = \\lambda\' - \\lambda_0 = \\lambda_C (1 - \\cos\\theta)$**.',
          'Here $\\lambda_C = \\frac{h}{m_e c} \\approx 2.426\\text{ pm}$ is the **Compton wavelength of the electron**. Maximum energy transfer to the recoil electron occurs for $180^\\circ$ backscattering ($\\cos\\theta = -1$), where $\\Delta\\lambda_{\\text{max}} = 2\\lambda_C \\approx 4.85\\text{ pm}$. Compton’s discovery proved conclusively that photons carry mechanical momentum $\\vec{p} = \\hbar\\vec{k}$.'
        ]
      },
      bohr: {
        uk: [
          'У класичній електродинаміці електрон, що обертається навколо ядра з доцентровим прискоренням $a_n = v^2/r$, мав би безперервно випромінювати електромагнітні хвилі, втратити енергію за $\\sim 10^{-11}\\text{ с}$ і впасти на ядро. Щоб розв’язати цю кризу, Нільс Бор у 1913 році сформулював **квантові постулати**: атом може перебувати лише у дискретних стаціонарних станах із моментами імпульсу **$L_n = m_e v_n r_n = n\\hbar$** ($n = 1, 2, 3, \\dots$), у яких електрон не випромінює.',
          'У 1924 році Луї де Бройль розкрив глибокий хвильовий зміст правила квантування Бора: електрон має довжину хвилі де Бройля $\\lambda_B = \\frac{h}{m_e v_n}$, і стаціонарна орбіта стійка лише тоді, коли вздовж її кола $2\\pi r_n$ вкладається **ціле число $n$ стоячих хвиль де Бройля**: $2\\pi r_n = n\\lambda_B$ (інакше хвиля гасить сама себе внаслідок інтерференції!). Радіуси дозволених орбіт атома водню ростуть квадратично $r_n = n^2 a_0$ ($a_0 = 0.0529\\text{ нм}$ — борівський радіус), а рівні енергії квантуються як **$E_n = -\\frac{13.6\\text{ еВ}}{n^2}$**.',
          'Випромінювання або поглинання кванта світла відбувається лише під час стрибка електрона між двома орбітами $n_i \\to n_f$: $h\\nu = |E_{n_i} - E_{n_f}|$, що дає **спектральну формулу Рідберга**: $\\frac{1}{\\lambda} = R_H\\!\\left|\\frac{1}{n_f^2} - \\frac{1}{n_i^2}\\right|$ ($R_H = 1.097\\times 10^7\\text{ м}^{-1}$), яка з високою точністю пояснює ультрафіолетову серію Лаймана ($n_f = 1$), видиму серію Бальмера ($n_f = 2$) та інфрачервону серію Пашена ($n_f = 3$).'
        ],
        en: [
          'In classical electrodynamics, an orbiting electron undergoing centripetal acceleration $a_n = v^2/r$ would radiate away its energy and spiral into the nucleus within $\\sim 10^{-11}\\text{ s}$. In 1913, Niels Bohr resolved this instability by postulating that electrons occupy discrete **stationary orbits** with quantized angular momentum **$L_n = m_e v_n r_n = n\\hbar$** ($n = 1, 2, 3, \\dots$) that do not radiate.',
          'In 1924, Louis de Broglie explained Bohr’s quantization rule geometrically: a stationary orbit is stable if and only if its circumference $2\\pi r_n$ accommodates an **integer number $n$ of electron de Broglie wavelengths** $\\lambda_B = \\frac{h}{m_e v_n}$, forming a closed standing matter wave $2\\pi r_n = n\\lambda_B$! Allowed hydrogen radii scale as $r_n = n^2 a_0$ ($a_0 = 0.0529\\text{ nm}$) and energy levels follow **$E_n = -\\frac{13.6\\text{ eV}}{n^2}$**.',
          'A photon is emitted or absorbed only during a quantum jump $n_i \\to n_f$: $h\\nu = |E_{n_i} - E_{n_f}|$, yielding the **Rydberg spectral formula** $\\frac{1}{\\lambda} = R_H\\!\\left|\\frac{1}{n_f^2} - \\frac{1}{n_i^2}\\right|$ ($R_H = 1.097\\times 10^7\\text{ m}^{-1}$) across the Lyman ($n_f = 1$, UV), Balmer ($n_f = 2$, visible), and Paschen ($n_f = 3$, IR) series.'
        ]
      },
      biot: {
        uk: [
          'За **законом Біо — Савара — Лапласа**, кожен нескінченно малий елемент провідника $d\\vec{l}$ зі струмом $I$ створює в точці з радіус-вектором $\\vec{r}$ елементарну індукцію магнітного поля $d\\vec{B} = \\frac{\\mu_0 I}{4\\pi}\\frac{[d\\vec{l} \\times \\vec{r}]}{r^3}$. Якщо проінтегрувати цей вираз уздовж колового витка радіуса $R$ з $N$ витками для точки на осі симетрії $Ox$ на відстані $x$ від центра, поперечні складові взаємно компенсуються, а осьова індукція становить **$B_1(x) = \\frac{\\mu_0 N I R^2}{2(R^2 + x^2)^{3/2}}$**.',
          'В одному витку поле в центрі максимальне, але швидко спадає при віддаленні вздовж осі (друга похідна $\\frac{d^2 B_1}{dx^2} < 0$). Щоб отримати **високооднорідне магнітне поле** у відкритому лабораторному об’ємі, Герман фон Гельмгольц запропонував поставити дві однакові співвісні котушки радіуса $R$ зі співнапрямленими струмами на відстані $d$ одна від одної: $B(x) = B_1(x + d/2) + B_1(x - d/2)$.',
          'У середній точці між котушками ($x = 0$) перша похідна $\\frac{dB}{dx}\\big|_0 = 0$ за симетрією зникає при будь-якому $d$. Якщо ж обрати **відстань Гельмгольца $d = R$** (відстань між котушками точно дорівнює їхньому радіусу!), то в центрі системи одночасно перетворюються на нуль і друга $\\frac{d^2 B}{dx^2}\\big|_0 = 0$, і третя похідні поля! Завдяки цьому між котушками утворюється широке плато однорідного поля з індукцією **$B(0) = \\left(\\frac{4}{5}\\right)^{\\!3/2}\\frac{\\mu_0 N I}{R} \\approx 0.7155\\frac{\\mu_0 N I}{R}$**.'
        ],
        en: [
          'By the **Biot–Savart Law**, a current element $I\\,d\\vec{l}$ produces a magnetic field $d\\vec{B} = \\frac{\\mu_0 I}{4\\pi}\\frac{[d\\vec{l} \\times \\vec{r}]}{r^3}$. Integrating around a circular coil of radius $R$ and $N$ turns at axial distance $x$ cancels all radial components and yields the axial field **$B_1(x) = \\frac{\\mu_0 N I R^2}{2(R^2 + x^2)^{3/2}}$**.',
          'A single loop’s field peaks at $x = 0$ but curves downward rapidly ($\\frac{d^2 B_1}{dx^2} < 0$). To create a wide region of **uniform magnetic field** with open optical and mechanical access, Hermann von Helmholtz paired two identical coaxial coils of radius $R$ carrying parallel currents separated by distance $d$: $B(x) = B_1(x + d/2) + B_1(x - d/2)$.',
          'At the midpoint $x = 0$, symmetry guarantees $\\frac{dB}{dx}\\big|_0 = 0$ for any separation $d$. Setting the separation equal to the coil radius (**Helmholtz condition $d = R$**) places the inflection points of the two coils directly at $x = 0$, making both $\\frac{d^2 B}{dx^2}\\big|_0 = 0$ and $\\frac{d^3 B}{dx^3}\\big|_0 = 0$ vanish simultaneously! This creates a flat plateau of uniform field **$B(0) = \\left(\\frac{4}{5}\\right)^{\\!3/2}\\frac{\\mu_0 N I}{R} \\approx 0.7155\\frac{\\mu_0 N I}{R}$**.'
        ]
      },
      transformer: {
        uk: [
          '**Трансформатор** — це електромагнітний статичний апарат, призначений для підвищення або зниження напруги змінного струму без зміни його частоти $f$ за допомогою явища взаємної електромагнітної індукції. Первинна обмотка з числом витків $N_1$ та вторинна обмотка з числом витків $N_2$ насаджені на спільне замкнене **феромагнітне осердя** з високою магнітною проникністю ($\\mu \\sim 10^3\\text{–}10^4$), яке концентрує змінний магнітний потік $\\Phi(t) = \\Phi_m\\sin(2\\pi f t)$ так, що він пронизує кожен виток обох котушок.',
          'За законом електромагнітної індукції Фарадея в одному витку індукується однакова ЕРС $e_1 = -\\frac{d\\Phi}{dt}$. Тому відношення діючих значень напруг на обмотках дорівнює відношенню кількості витків (**коефіцієнт трансформації**): **$\\frac{U_2}{U_1} = \\frac{N_2}{N_1} = k$**. Якщо $N_2 > N_1$ ($k > 1$), трансформатор є **підвищувальним**; якщо $N_2 < N_1$ ($k < 1$) — **знижувальним**.',
          'Згідно із законом збереження енергії, потужність на виході дорівнює вхідній потужності, помноженій на ККД $\\eta$ (який у силових трансформаторах досягає $95\\text{–}99\\%$ завдяки шихтованому осердю з тонких пластин електротехнічної сталі, що пригнічує вихрові струми Фуко): $P_2 = \\eta P_1 \\implies U_2 I_2 = \\eta U_1 I_1$. Отже, **у скільки разів трансформатор підвищує напругу, у стільки ж разів він зменшує силу струму**: $\\frac{I_2}{I_1} = \\eta\\frac{N_1}{N_2}$. Саме це дозволяє передавати електроенергію в ЛЕП при високих напругах ($110\\text{–}750\\text{ кВ}$) із мінімальними тепловими втратами в дротах $P_{\\text{втр}} = I^2 R_{\\text{лінії}} \\propto 1/U^2$!'
        ],
        en: [
          'An **AC transformer** steps alternating voltage up or down at constant frequency $f$ via mutual electromagnetic induction. A primary winding of $N_1$ turns and a secondary winding of $N_2$ turns are wound around a closed laminated **ferromagnetic core** of high permeability ($\\mu \\sim 10^3\\text{–}10^4$), which channels the alternating magnetic flux $\\Phi(t) = \\Phi_m\\sin(2\\pi f t)$ through every turn of both coils.',
          'By Faraday’s law of induction, each turn experiences the same induced EMF $-\\frac{d\\Phi}{dt}$. Consequently, the ratio of secondary to primary RMS voltages equals the **turns ratio**: **$\\frac{U_2}{U_1} = \\frac{N_2}{N_1} = k$**. For $N_2 > N_1$ ($k > 1$) it acts as a **step-up transformer**; for $N_2 < N_1$ ($k < 1$) as a **step-down transformer**.',
          'By conservation of energy with core efficiency $\\eta$ (typically $95\\text{–}99\\%$, using silicon-steel laminations to suppress eddy currents and hysteresis), output power satisfies $P_2 = \\eta P_1 \\implies U_2 I_2 = \\eta U_1 I_1$. Thus **stepping up voltage proportionally steps down current**: $\\frac{I_2}{I_1} = \\eta\\frac{N_1}{N_2}$. High-voltage power grids ($110\\text{–}750\\text{ kV}$) exploit this to slash transmission line Joule losses $P_{\\text{loss}} = I^2 R_{\\text{line}} \\propto 1/U^2$!'
        ]
      }
    };

    const BOOK_SVG_ICON = `<svg class="theory-book-svg" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5C2.5 3.95 2.95 3.5 3.5 3.5H7.8C9.15 3.5 10 4.25 10 5.5V16.2C10 15.35 9.25 14.8 8.2 14.8H3.5C2.95 14.8 2.5 14.35 2.5 13.8V4.5Z"/><path d="M17.5 4.5C17.5 3.95 17.05 3.5 16.5 3.5H12.2C10.85 3.5 10 4.25 10 5.5V16.2C10 15.35 10.75 14.8 11.8 14.8H16.5C17.05 14.8 17.5 14.35 17.5 13.8V4.5Z"/></svg>`;

    let theoryLeftOpen = false;
    let theoryRightOpen = false;

    function syncTheoryDrawersUI() {
      const t = tUI();
      const btnLeft = document.getElementById('btn-theory-book');
      const drawerLeft = document.getElementById('theory-drawer-box');
      const btnHdr = document.getElementById('btn-header-theory');
      if (btnLeft && drawerLeft) {
        btnLeft.classList.toggle('open', theoryLeftOpen);
        btnLeft.setAttribute('aria-expanded', theoryLeftOpen ? 'true' : 'false');
        drawerLeft.classList.toggle('open', theoryLeftOpen);
        drawerLeft.setAttribute('aria-hidden', theoryLeftOpen ? 'false' : 'true');
        const lblEl = document.getElementById('ui-theory-btn-label');
        const hintEl = document.getElementById('ui-theory-btn-hint');
        if (lblEl) lblEl.textContent = t.theoryBtnTitle;
        if (hintEl) hintEl.textContent = theoryLeftOpen ? t.theoryCollapseHint : t.theoryExpandHint;
      }
      if (btnHdr) {
        btnHdr.classList.toggle('open', theoryLeftOpen);
        btnHdr.setAttribute('aria-expanded', theoryLeftOpen ? 'true' : 'false');
        const hdrLbl = document.getElementById('ui-header-theory-label');
        if (hdrLbl) hdrLbl.textContent = t.theoryBtnShort;
      }

      const btnRight = document.getElementById('ui-ref-heading-right');
      const drawerRight = document.getElementById('theory-drawer-right');
      if (btnRight && drawerRight) {
        btnRight.classList.toggle('open', theoryRightOpen);
        btnRight.setAttribute('aria-expanded', theoryRightOpen ? 'true' : 'false');
        drawerRight.classList.toggle('open', theoryRightOpen);
        drawerRight.setAttribute('aria-hidden', theoryRightOpen ? 'false' : 'true');
        const rightLbl = btnRight.querySelector('.ref-book-label');
        if (rightLbl) rightLbl.textContent = t.theoryBtnShort;
      }
    }

    function buildTheoryInnerHTML(key) {
      const t = tUI();
      const langKey = uiState.lang === 'uk' ? 'uk' : 'en';
      const entry = THEORY_NOTES[key] || THEORY_NOTES.collision;
      const paragraphs = (entry && entry[langKey]) || entry.en;
      const cfg = SCENE_CONFIGS[key];
      const titles = [t.theorySec1Title, t.theorySec2Title, t.theorySec3Title];

      return paragraphs
        .map((pText, idx) => `
          <div class="theory-note-block">
            <div class="theory-note-subtitle">${titles[idx] || ''}</div>
            <p class="theory-note-para">${formatTextbookProse(pText)}</p>
          </div>
        `)
        .join('') + (cfg && cfg.referenceLatex ? `
          <div class="theory-note-formula">
            ${renderStackedMath(cfg.referenceLatex)}
          </div>
        ` : '');
    }

    function ensureTheoryBookUI() {
      // 1. Кнопка книги та розгортний конспект у лівій панелі (відразу під заголовком та епіграфом параграфа)
      const chapterHeader = document.querySelector('.chapter-header');
      if (chapterHeader && !document.getElementById('btn-theory-book')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btn-theory-book';
        btn.className = 'btn-theory-book';
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = `
          <span class="theory-book-left">
            ${BOOK_SVG_ICON}
            <span id="ui-theory-btn-label" class="theory-book-label">Теоретичний конспект</span>
          </span>
          <span class="theory-book-right">
            <span id="ui-theory-btn-hint" class="theory-book-hint">Читати</span>
            <span class="theory-book-chevron" aria-hidden="true">▾</span>
          </span>
        `;

        const drawer = document.createElement('div');
        drawer.id = 'theory-drawer-box';
        drawer.className = 'theory-drawer-box';
        drawer.setAttribute('aria-hidden', 'true');
        drawer.innerHTML = `<div id="theory-drawer-content" class="theory-drawer-content"></div>`;

        chapterHeader.appendChild(btn);
        chapterHeader.appendChild(drawer);

        btn.addEventListener('click', () => {
          theoryLeftOpen = !theoryLeftOpen;
          syncTheoryDrawersUI();
          if (theoryLeftOpen) {
            requestAnimationFrame(fitMathContainers);
          }
        });
      }

      // 2. Компактна кнопка-книжка у верхній панелі навігації (.header-right)
      const headerRight = document.querySelector('.header-right');
      if (headerRight && !document.getElementById('btn-header-theory')) {
        const hdrBtn = document.createElement('button');
        hdrBtn.type = 'button';
        hdrBtn.id = 'btn-header-theory';
        hdrBtn.className = 'btn-header-theory';
        hdrBtn.setAttribute('aria-expanded', 'false');
        hdrBtn.title = 'Теоретичний конспект / Theoretical Notes';
        hdrBtn.innerHTML = `
          ${BOOK_SVG_ICON}
          <span id="ui-header-theory-label">Теорія</span>
        `;
        headerRight.insertBefore(hdrBtn, headerRight.firstChild);

        hdrBtn.addEventListener('click', () => {
          const leftSidebar = document.getElementById('left-sidebar');
          const btnToggleLeftEl = document.getElementById('btn-toggle-left');
          if (leftSidebar && leftSidebar.classList.contains('panel-hidden')) {
            leftSidebar.classList.remove('panel-hidden');
            if (btnToggleLeftEl) {
              btnToggleLeftEl.classList.remove('collapsed');
              btnToggleLeftEl.textContent = '‹';
            }
          }
          theoryLeftOpen = !theoryLeftOpen;
          syncTheoryDrawersUI();
          if (theoryLeftOpen) {
            requestAnimationFrame(() => {
              fitMathContainers();
              const btnLeft = document.getElementById('btn-theory-book');
              if (btnLeft) btnLeft.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
          }
        });
      }

      // 3. Кнопка-книжка в правій колонці (#ui-ref-heading-right) + локальний розгортний блок під формулами
      const refRight = document.getElementById('ui-ref-heading-right');
      const refFormulaBox = document.getElementById('reference-formula-box');
      if (refRight && refFormulaBox && !refRight.dataset.bookBound) {
        refRight.dataset.bookBound = '1';
        refRight.classList.add('btn-ref-book-trigger');
        refRight.setAttribute('role', 'button');
        refRight.setAttribute('tabindex', '0');
        refRight.setAttribute('aria-expanded', 'false');
        refRight.innerHTML = `${BOOK_SVG_ICON}<span class="ref-book-label">${tUI().theoryBtnShort}</span><span class="ref-book-chev" aria-hidden="true">▾</span>`;

        const drawerRight = document.createElement('div');
        drawerRight.id = 'theory-drawer-right';
        drawerRight.className = 'theory-drawer-box theory-drawer-right';
        drawerRight.setAttribute('aria-hidden', 'true');
        drawerRight.innerHTML = `<div id="theory-drawer-right-content" class="theory-drawer-content"></div>`;
        refFormulaBox.insertAdjacentElement('afterend', drawerRight);

        const toggleRight = () => {
          theoryRightOpen = !theoryRightOpen;
          syncTheoryDrawersUI();
          if (theoryRightOpen) {
            requestAnimationFrame(fitMathContainers);
          }
        };
        refRight.addEventListener('click', toggleRight);
        refRight.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleRight();
          }
        });
      }
    }

    function updateTheoryDrawerContent() {
      ensureTheoryBookUI();
      const key = uiState.activeScene;
      const html = buildTheoryInnerHTML(key);
      const leftContent = document.getElementById('theory-drawer-content');
      const rightContent = document.getElementById('theory-drawer-right-content');
      if (leftContent) leftContent.innerHTML = html;
      if (rightContent) rightContent.innerHTML = html;
      syncTheoryDrawersUI();
    }

    function tUI() {
      return UI_STRINGS[uiState.lang] || UI_STRINGS.en;
    }

    let lastEnergyUIArgs = null;

    function applyLanguage(lang) {
      uiState.lang = lang === 'uk' ? 'uk' : 'en';
      document.documentElement.lang = uiState.lang;
      const t = tUI();
      document.title = t.docTitle;

      const btnEn = document.getElementById('lang-en');
      const btnUk = document.getElementById('lang-uk');
      if (btnEn) btnEn.classList.toggle('active', uiState.lang === 'en');
      if (btnUk) btnUk.classList.toggle('active', uiState.lang === 'uk');

      const mobBtnEn = document.getElementById('mobile-lang-en');
      const mobBtnUk = document.getElementById('mobile-lang-uk');
      if (mobBtnEn) mobBtnEn.classList.toggle('active', uiState.lang === 'en');
      if (mobBtnUk) mobBtnUk.classList.toggle('active', uiState.lang === 'uk');

      // Apply scene dictionary (SCENE_EN or SCENE_UK) onto SCENE_CONFIGS in-place
      const dict = uiState.lang === 'en' ? SCENE_EN : SCENE_UK;
      Object.keys(SCENE_CONFIGS).forEach(k => {
        const src = dict[k];
        if (!src) return;
        const target = SCENE_CONFIGS[k];
        target.secTag = src.secTag;
        target.shortTitle = src.shortTitle;
        target.subtitle = src.subtitle;
        target.badge = src.badge;
        target.categoryGroupTitle = src.categoryGroupTitle;
        target.title = src.title;
        target.epigraph = src.epigraph;
        target.figCaption = src.figCaption;
        target.ekLabel = src.ekLabel;
        target.epLabel = src.epLabel;
        target.qLabel = src.qLabel;
        target.question = src.question;
        target.options = [...src.options];
        target.explanation = src.explanation;
        target.referenceLatex = src.referenceLatex;
        target.formulaLatex = src.formulaLatex;
        target.liveLatexFn = src.liveLatexFn;
        src.sliders.forEach((sTrans, idx) => {
          if (target.sliders[idx]) {
            target.sliders[idx].label = sTrans.label;
            target.sliders[idx].unit = sTrans.unit;
          }
        });
      });

      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      setTxt('ui-spine-sub', t.spineSub);
      setTxt('ui-spine-main', t.spineMain);
      setTxt('ui-ad-hdr-badge', t.adHdrBadge);
      setTxt('ui-ad-hdr-text', t.adHdrText);
      setTxt('ui-ad-hdr-sub', t.adHdrSub);
      setTxt('ui-ad-hdr-cta', t.adHdrCta);
      setTxt('ui-ad-left-label', t.adLeftLabel);
      setTxt('ui-ad-left-title', t.adLeftTitle);
      setTxt('ui-ad-left-sub', t.adLeftSub);
      setTxt('ui-ad-right-label', t.adRightLabel);
      setTxt('ui-ad-right-title', t.adRightTitle);
      setTxt('ui-ad-right-sub', t.adRightSub);
      setTxt('filter-btn-all', t.filterAll);
      setTxt('filter-btn-optics', t.filterOptics);
      setTxt('filter-btn-mechanics', t.filterMechanics);
      setTxt('filter-btn-thermo', t.filterThermo);
      setTxt('filter-btn-electro', t.filterElectro);
      setTxt('crumb-predict', t.crumbPredict);
      setTxt('crumb-test', t.crumbTest);
      setTxt('crumb-explain', t.crumbExplain);
      setTxt('cam-iso', t.camIso);
      setTxt('cam-front', t.camFront);
      setTxt('cam-top', t.camTop);
      setTxt('cam-side', t.camSide);
      setTxt('cam-macro', t.camMacro);
      setTxt('cam-orbit', t.camOrbit);
      setTxt('ui-problem-label', t.problemLabel);
      setTxt('ui-your-answer', t.yourAnswer);
      setTxt('btn-change-prediction', t.changeBtn);
      setTxt('btn-step', t.stepBtn);
      setTxt('btn-reset', t.resetBtn);
      setTxt('ui-eq-header-left', t.eqHeaderLeft);
      setTxt('ui-eq-header-right', t.eqHeaderRight);
      setTxt('ui-energy-balance-title', t.energyBalanceTitle);
      setTxt('ui-ref-heading-left', t.refHeadingLeft);
      setTxt('ui-params-heading', t.paramsHeading);
      setTxt('btn-preset-default', t.presetDefault);
      setTxt('ui-diagram-heading', t.diagramHeading);
      setTxt('ui-toggle-vectors', t.toggleVectors);
      setTxt('ui-toggle-labels', t.toggleLabels);
      setTxt('ui-toggle-trails', t.toggleTrails);
      setTxt('ui-toggle-particles', t.toggleParticles);
      setTxt('ui-mobile-unsupported-title', t.mobileUnsupportedTitle);
      setTxt('ui-mobile-unsupported-sub', t.mobileUnsupportedSub);

      const prevBtn = document.getElementById('btn-prev-chapter');
      const nextBtn = document.getElementById('btn-next-chapter');
      if (prevBtn) prevBtn.title = t.prevTitle;
      if (nextBtn) nextBtn.title = t.nextTitle;

      const setLegend = (id, htmlStr) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = formatTextbookProse(htmlStr);
      };
      setLegend('ui-legend-v', t.legendV);
      setLegend('ui-legend-p', t.legendP);
      setLegend('ui-legend-mg', t.legendMg);
      setLegend('ui-legend-n', t.legendN);

      setTxt('sim-time-readout', `t = ${uiState.simTime.toFixed(2)} ${t.secUnit}`);

      if (uiState.selectedOption !== null) {
        setTxt('chosen-option-summary', `${t.optionPrefix} ${t.letters[uiState.selectedOption]}`);
      }

      activeVectorArrows.forEach(arrow => arrow.refreshLanguage());

      updateDropdownTriggerUI();
      renderQuestionAndSliders();
      syncActionButtons();

      if (uiState.phase === 'explain') {
        const cfg = SCENE_CONFIGS[uiState.activeScene];
        const verdictBanner = document.getElementById('verdict-banner');
        const isCorrect = uiState.selectedOption === cfg.correctIndex;
        verdictBanner.className = `proof-verdict ${isCorrect ? 'correct' : 'incorrect'}`;
        verdictBanner.textContent = isCorrect ? t.verdictCorrect : t.verdictIncorrect;
        document.getElementById('explain-text').innerHTML = formatTextbookProse(cfg.explanation);
      }

      if (lastEnergyUIArgs) {
        updateEnergyUI(...lastEnergyUIArgs, true);
      }
      syncPageSeoAndUrl(false);
    }

    const chartCanvas = document.getElementById('chart-canvas');
    const chartCtx = chartCanvas.getContext('2d');

    function updateEnergyUI(ek, ep, q, maxRefEnergy, telemetryItems, skipHistory = false) {
      lastEnergyUIArgs = [ek, ep, q, maxRefEnergy, telemetryItems];
      const uJ = tUI().jouleUnit;
      document.getElementById('ek-val').textContent = `${ek.toFixed(1)} ${uJ}`;
      document.getElementById('ep-val').textContent = `${ep.toFixed(1)} ${uJ}`;
      document.getElementById('q-val').textContent = `${q.toFixed(1)} ${uJ}`;
      const tot = ek + ep + q;
      document.getElementById('etot-val').textContent = `E = ${tot.toFixed(1)} ${uJ}`;

      const denom = Math.max(maxRefEnergy, tot, 0.01);
      document.getElementById('ek-bar').style.width = `${Math.min(100, (ek / denom) * 100)}%`;
      document.getElementById('ep-bar').style.width = `${Math.min(100, (ep / denom) * 100)}%`;
      document.getElementById('q-bar').style.width = `${Math.min(100, (q / denom) * 100)}%`;

      const grid = document.getElementById('telemetry-grid');
      grid.innerHTML = telemetryItems
        .map(item => {
          const lbl = uiState.lang === 'en' ? (TELEMETRY_LABEL_EN[item.label] || item.label) : item.label;
          const val = translateTelemetryVal(item.val);
          return `
        <div class="meas-cell">
          <span class="meas-name">${lbl}</span>
          <span class="meas-num">${val}</span>
        </div>`;
        })
        .join('');

      if (uiState.running && !skipHistory) {
        chartHistory.ek.push(ek / denom);
        chartHistory.ep.push(ep / denom);
        chartHistory.q.push(q / denom);
        if (chartHistory.ek.length > chartHistory.maxPoints) {
          chartHistory.ek.shift();
          chartHistory.ep.shift();
          chartHistory.q.shift();
        }
      }
      drawEnergyChart();
    }

    function drawEnergyChart() {
      const w = chartCanvas.width;
      const h = chartCanvas.height;
      chartCtx.clearRect(0, 0, w, h);

      chartCtx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      chartCtx.lineWidth = 1;
      for (let y = 18; y < h; y += 22) {
        chartCtx.beginPath();
        chartCtx.moveTo(0, y);
        chartCtx.lineTo(w, y);
        chartCtx.stroke();
      }

      const drawSeries = (arr, color) => {
        if (arr.length < 2) return;
        chartCtx.strokeStyle = color;
        chartCtx.lineWidth = 2.0;
        chartCtx.beginPath();
        for (let i = 0; i < arr.length; i++) {
          const x = (i / (chartHistory.maxPoints - 1)) * w;
          const y = h - 8 - Math.min(1, Math.max(0, arr[i])) * (h - 16);
          if (i === 0) chartCtx.moveTo(x, y);
          else chartCtx.lineTo(x, y);
        }
        chartCtx.stroke();
      };

      drawSeries(chartHistory.ek, '#16a34a');
      drawSeries(chartHistory.ep, '#2563eb');
      drawSeries(chartHistory.q, '#d97706');
    }

    function updateLiveFormulaSubstitution() {
      const key = uiState.activeScene;
      const cfg = SCENE_CONFIGS[key];
      const p = sceneParams[key];

      document.getElementById('reference-formula-box').innerHTML = renderStackedMath(cfg.referenceLatex);
      document.getElementById('explain-formula-katex').innerHTML = renderStackedMath(cfg.formulaLatex);
      if (cfg.liveLatexFn) {
        document.getElementById('explain-live-katex').innerHTML = renderLiveMathChips(cfg.liveLatexFn(p));
      }
      requestAnimationFrame(fitMathContainers);
    }

    function transitionToPhase(newPhase) {
      uiState.phase = newPhase;
      const t = tUI();

      const cPredict = document.getElementById('crumb-predict');
      const cTest = document.getElementById('crumb-test');
      const cExplain = document.getElementById('crumb-explain');

      const predictSection = document.getElementById('predict-section');
      const collapsedPrediction = document.getElementById('collapsed-prediction');
      const actionStage = document.getElementById('action-stage');
      const explainStage = document.getElementById('explain-stage');

      cPredict.className = 'phase-crumb';
      cTest.className = 'phase-crumb';
      cExplain.className = 'phase-crumb';
      actionStage.classList.add('visible');

      if (newPhase === 'predict') {
        cPredict.classList.add('current');
        predictSection.style.display = 'flex';
        collapsedPrediction.classList.remove('visible');
        explainStage.classList.remove('visible');
        syncActionButtons();
      } else if (newPhase === 'test') {
        cPredict.classList.add('done');
        cTest.classList.add('current');
        predictSection.style.display = uiState.selectedOption !== null ? 'none' : 'flex';
        if (uiState.selectedOption !== null) {
          collapsedPrediction.classList.add('visible');
        } else {
          collapsedPrediction.classList.remove('visible');
        }
        explainStage.classList.remove('visible');
        syncActionButtons();
      } else if (newPhase === 'explain') {
        cPredict.classList.add('done');
        cTest.classList.add('done');
        cExplain.classList.add('current');

        if (uiState.selectedOption !== null) {
          predictSection.style.display = 'none';
          collapsedPrediction.classList.add('visible');
        } else {
          predictSection.style.display = 'flex';
          collapsedPrediction.classList.remove('visible');
        }
        explainStage.classList.add('visible');

        const cfg = SCENE_CONFIGS[uiState.activeScene];
        const verdictBanner = document.getElementById('verdict-banner');
        if (uiState.selectedOption !== null) {
          const isCorrect = uiState.selectedOption === cfg.correctIndex;
          verdictBanner.style.display = 'block';
          verdictBanner.className = `proof-verdict ${isCorrect ? 'correct' : 'incorrect'}`;
          verdictBanner.textContent = isCorrect ? t.verdictCorrect : t.verdictIncorrect;
        } else {
          const correctLetter = t.letters[cfg.correctIndex] || 'B';
          verdictBanner.style.display = 'block';
          verdictBanner.className = 'proof-verdict correct';
          verdictBanner.textContent = `${t.verdictCorrect} (${t.optionPrefix} ${correctLetter})`;
        }

        document.getElementById('explain-text').innerHTML = formatTextbookProse(cfg.explanation);
        updateLiveFormulaSubstitution();
        syncActionButtons();
      }
    }

    function syncActionButtons() {
      const primaryCta = document.getElementById('btn-primary-cta');
      const pauseToggle = document.getElementById('btn-pause-toggle');
      const t = tUI();

      if (uiState.running) {
        primaryCta.style.display = 'none';
        pauseToggle.style.display = 'inline-flex';
        pauseToggle.textContent = t.pauseBtn;
      } else if (uiState.simTime === 0) {
        primaryCta.style.display = 'inline-flex';
        primaryCta.textContent = t.runExp;
        pauseToggle.style.display = 'none';
      } else {
        primaryCta.style.display = 'inline-flex';
        primaryCta.textContent = uiState.phase === 'explain' ? t.repeatExp : t.continueExp;
        pauseToggle.style.display = 'none';
      }
    }

    function updateSliderFill(inputEl) {
      const min = parseFloat(inputEl.min);
      const max = parseFloat(inputEl.max);
      const val = parseFloat(inputEl.value);
      const pct = ((val - min) / (max - min)) * 100;
      inputEl.style.setProperty('--progress', `${pct}%`);
    }

    function renderQuestionAndSliders() {
      const key = uiState.activeScene;
      const cfg = SCENE_CONFIGS[key];
      const t = tUI();

      document.getElementById('chapter-section-tag').textContent = cfg.secTag;
      document.getElementById('scene-title').textContent = cfg.title;
      document.getElementById('scene-epigraph').textContent = cfg.epigraph;
      document.getElementById('figure-caption-text').textContent = cfg.figCaption;

      document.getElementById('ek-label').textContent = cfg.ekLabel;
      document.getElementById('ep-label').textContent = cfg.epLabel;
      document.getElementById('q-label').textContent = cfg.qLabel;

      document.getElementById('question-text').innerHTML = formatTextbookProse(cfg.question);

      const letters = t.letters;
      const optionsContainer = document.getElementById('options-container');
      optionsContainer.innerHTML = '';

      cfg.options.forEach((optText, idx) => {
        const btn = document.createElement('button');
        btn.className = `book-option-btn${uiState.selectedOption === idx ? ' selected' : ''}`;
        btn.innerHTML = `<span class="option-letter">${letters[idx]}</span><span style="min-width:0;overflow-wrap:break-word;">${formatTextbookProse(optText)}</span>`;
        btn.addEventListener('click', () => {
          uiState.selectedOption = idx;
          document.getElementById('chosen-option-summary').textContent = `${t.optionPrefix} ${letters[idx]}`;
          if (!uiState.running && uiState.simTime === 0) {
            uiState.running = true;
          }
          transitionToPhase('explain');
        });
        optionsContainer.appendChild(btn);
      });

      const slidersContainer = document.getElementById('sliders-container');
      slidersContainer.innerHTML = '';

      cfg.sliders.forEach(s => {
        const currentVal = sceneParams[key][s.key];
        const item = document.createElement('div');
        item.className = 'param-control';
        item.innerHTML = `
          <div class="param-header">
            <span class="param-title">${s.label}</span>
            <span class="param-readout">${currentVal}${s.unit ? ' ' + s.unit : ''}</span>
          </div>
          <input type="range" class="book-slider" min="${s.min}" max="${s.max}" step="${s.step}" value="${currentVal}" />
        `;
        slidersContainer.appendChild(item);

        const input = item.querySelector('input');
        const readout = item.querySelector('.param-readout');
        updateSliderFill(input);

        input.addEventListener('input', e => {
          const val = parseFloat(e.target.value);
          sceneParams[key][s.key] = val;
          readout.textContent = `${val}${s.unit ? ' ' + s.unit : ''}`;
          updateSliderFill(input);
          updateLiveFormulaSubstitution();

          if (!uiState.running && activeSim) {
            uiState.simTime = 0;
            const t = tUI();
            document.getElementById('sim-time-readout').textContent = `t = 0.00 ${t.secUnit}`;
            resetChartHistory();
            activeSim.reset();
            syncActionButtons();
          } else if (activeSim) {
            if (key === 'projectile') activeSim.computeVacuumCurve();
            if (typeof activeSim.syncVisuals === 'function') {
              activeSim.syncVisuals();
            }
          }
        });
      });

      updateLiveFormulaSubstitution();
      updateTheoryDrawerContent();
    }

    // ============================================================================
    // 13. DROPDOWN MENU WITH 16 EXPERIMENTS, CAMERA PROJECTIONS & LANGUAGE TOGGLE
    // ============================================================================
    const SCENE_KEYS_ORDER = Object.keys(SCENE_CONFIGS);
    let currentDropdownFilter = 'all';

    document.getElementById('lang-en').addEventListener('click', () => applyLanguage('en'));
    document.getElementById('lang-uk').addEventListener('click', () => applyLanguage('uk'));
    const mobLangEn = document.getElementById('mobile-lang-en');
    const mobLangUk = document.getElementById('mobile-lang-uk');
    if (mobLangEn) mobLangEn.addEventListener('click', () => applyLanguage('en'));
    if (mobLangUk) mobLangUk.addEventListener('click', () => applyLanguage('uk'));

    // Інтерактивні хлібні крихти етапів та кнопки згортання бічних панелей
    document.getElementById('crumb-predict').addEventListener('click', () => transitionToPhase('predict'));
    document.getElementById('crumb-test').addEventListener('click', () => transitionToPhase('test'));
    document.getElementById('crumb-explain').addEventListener('click', () => transitionToPhase('explain'));

    const leftSidebarEl = document.getElementById('left-sidebar');
    const rightSidebarEl = document.getElementById('right-sidebar');
    const btnToggleLeft = document.getElementById('btn-toggle-left');
    const btnToggleRight = document.getElementById('btn-toggle-right');

    btnToggleLeft.addEventListener('click', () => {
      const hidden = leftSidebarEl.classList.toggle('panel-hidden');
      btnToggleLeft.classList.toggle('collapsed', hidden);
      btnToggleLeft.textContent = hidden ? '›' : '‹';
      if (!hidden) requestAnimationFrame(fitMathContainers);
    });

    btnToggleRight.addEventListener('click', () => {
      const hidden = rightSidebarEl.classList.toggle('panel-hidden');
      btnToggleRight.classList.toggle('collapsed', hidden);
      btnToggleRight.textContent = hidden ? '‹' : '›';
      if (!hidden) requestAnimationFrame(fitMathContainers);
    });

    function renderDropdownMenu() {
      const listEl = document.getElementById('dropdown-items-list');
      if (!listEl) return;
      listEl.innerHTML = '';

      let lastGroupTitle = '';
      SCENE_KEYS_ORDER.forEach(key => {
        const cfg = SCENE_CONFIGS[key];
        if (currentDropdownFilter !== 'all' && cfg.category !== currentDropdownFilter) return;

        if (cfg.categoryGroupTitle && cfg.categoryGroupTitle !== lastGroupTitle) {
          lastGroupTitle = cfg.categoryGroupTitle;
          const groupHdr = document.createElement('div');
          groupHdr.className = 'dropdown-group-title';
          groupHdr.textContent = cfg.categoryGroupTitle;
          listEl.appendChild(groupHdr);
        }

        const isActive = key === uiState.activeScene;
        const item = document.createElement('a');
        item.href = getExperimentHref(key, uiState.lang);
        item.className = `dropdown-exp-item${isActive ? ' active' : ''}`;
        item.innerHTML = `
          <span class="exp-item-left">
            <span class="exp-item-sec">${cfg.secSym}</span>
            <span class="exp-item-info">
              <span class="exp-item-title">${cfg.shortTitle}</span>
              <span class="exp-item-sub">${cfg.subtitle}</span>
            </span>
          </span>
          <span class="exp-item-badge ${cfg.category === 'optics' ? 'optics' : ''}">${cfg.badge}</span>
        `;
        item.addEventListener('click', e => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
          e.preventDefault();
          loadScene(key, true);
          closeDropdownMenu();
        });
        listEl.appendChild(item);
      });
    }

    function updateDropdownTriggerUI() {
      const cfg = SCENE_CONFIGS[uiState.activeScene];
      if (!cfg) return;
      const secEl = document.getElementById('trigger-sec-sym');
      const titleEl = document.getElementById('trigger-title');
      const catEl = document.getElementById('trigger-cat-pill');
      if (secEl) secEl.textContent = cfg.secSym;
      if (titleEl) titleEl.textContent = cfg.shortTitle;
      if (catEl) catEl.textContent = cfg.badge;

      renderDropdownMenu();
    }

    function closeDropdownMenu() {
      const wrapper = document.getElementById('exp-dropdown-wrapper');
      const trigger = document.getElementById('exp-dropdown-trigger');
      if (wrapper) wrapper.classList.remove('open');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    document.getElementById('exp-dropdown-trigger').addEventListener('click', e => {
      e.stopPropagation();
      const wrapper = document.getElementById('exp-dropdown-wrapper');
      const isOpen = wrapper.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', e => {
      const wrapper = document.getElementById('exp-dropdown-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        closeDropdownMenu();
      }
    });

    document.querySelectorAll('.filter-pill-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDropdownFilter = btn.dataset.filter;
        renderDropdownMenu();
      });
    });

    document.getElementById('btn-prev-chapter').addEventListener('click', () => {
      const idx = SCENE_KEYS_ORDER.indexOf(uiState.activeScene);
      const prevIdx = (idx - 1 + SCENE_KEYS_ORDER.length) % SCENE_KEYS_ORDER.length;
      loadScene(SCENE_KEYS_ORDER[prevIdx], true);
    });

    document.getElementById('btn-next-chapter').addEventListener('click', () => {
      const idx = SCENE_KEYS_ORDER.indexOf(uiState.activeScene);
      const nextIdx = (idx + 1) % SCENE_KEYS_ORDER.length;
      loadScene(SCENE_KEYS_ORDER[nextIdx], true);
    });

    const closeAdBtn = document.getElementById('btn-close-ad-banner');
    if (closeAdBtn) {
      closeAdBtn.addEventListener('click', () => {
        const banner = document.getElementById('ad-viewport-banner');
        if (banner) banner.classList.add('ad-closed');
      });
    }

    // ============================================================================
    // НАЛАШТУВАННЯ GOOGLE ADSENSE (впишіть ваші дані тут — застосується до всіх 94 сторінок)
    // ============================================================================
    const ADSENSE_CONFIG = {
      client: 'ca-pub-2903108049371777', // Ваш Publisher ID
      slots: {
        topBanner: '6817539766',         // ID рекламного блоку верхнього та мобільного банера (Baner)
        leftSidebar: '4173783296',       // ID рекламного блоку лівої панелі (Sidebar)
        rightSidebar: '4173783296'       // ID рекламного блоку правої панелі (Sidebar)
      }
    };

    function detectMobilePhone() {
      const ua = navigator.userAgent || '';
      const isPhoneUA = /Android.*Mobile|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(ua);
      const isSmallViewport = window.innerWidth <= 820;
      if (isPhoneUA || isSmallViewport) {
        document.body.classList.add('is-mobile-phone');
      } else {
        document.body.classList.remove('is-mobile-phone');
      }
    }
    detectMobilePhone();
    window.addEventListener('resize', detectMobilePhone);

    function initGoogleAds() {
      const configuredClient = (ADSENSE_CONFIG.client && ADSENSE_CONFIG.client !== 'ca-pub-0000000000000000' && !ADSENSE_CONFIG.client.includes('XXXX'))
        ? ADSENSE_CONFIG.client
        : (window.__ADSENSE_CLIENT__ || '');
      const isRealClient = configuredClient && configuredClient !== 'ca-pub-0000000000000000' && !configuredClient.includes('XXXX');

      if (isRealClient && !document.querySelector('script[src*="adsbygoogle.js"]')) {
        const s = document.createElement('script');
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(configuredClient)}`;
        document.head.appendChild(s);
      }

      const topIns = document.querySelector('#ad-viewport-banner ins.adsbygoogle');
      if (topIns && isRealClient && ADSENSE_CONFIG.slots.topBanner && ADSENSE_CONFIG.slots.topBanner !== '1111111111') {
        topIns.style.display = 'block';
        topIns.setAttribute('data-ad-client', configuredClient);
        topIns.setAttribute('data-ad-slot', ADSENSE_CONFIG.slots.topBanner);
        topIns.setAttribute('data-ad-format', 'auto');
        topIns.setAttribute('data-full-width-responsive', 'true');
      }
      const mobileIns = document.querySelector('#ad-mobile-bottom ins.adsbygoogle');
      if (mobileIns && isRealClient && ADSENSE_CONFIG.slots.topBanner && ADSENSE_CONFIG.slots.topBanner !== '1111111111') {
        mobileIns.style.display = 'block';
        mobileIns.setAttribute('data-ad-client', configuredClient);
        mobileIns.setAttribute('data-ad-slot', ADSENSE_CONFIG.slots.topBanner);
        mobileIns.setAttribute('data-ad-format', 'auto');
        mobileIns.setAttribute('data-full-width-responsive', 'true');
      }
      const leftIns = document.querySelector('#ad-slot-left ins.adsbygoogle');
      if (leftIns && isRealClient && ADSENSE_CONFIG.slots.leftSidebar) {
        leftIns.style.display = 'block';
        leftIns.setAttribute('data-ad-client', configuredClient);
        leftIns.setAttribute('data-ad-slot', ADSENSE_CONFIG.slots.leftSidebar);
        leftIns.setAttribute('data-ad-format', 'auto');
        leftIns.setAttribute('data-full-width-responsive', 'true');
      }
      const rightIns = document.querySelector('#ad-slot-right ins.adsbygoogle');
      if (rightIns && isRealClient && ADSENSE_CONFIG.slots.rightSidebar) {
        rightIns.style.display = 'block';
        rightIns.setAttribute('data-ad-client', configuredClient);
        rightIns.setAttribute('data-ad-slot', ADSENSE_CONFIG.slots.rightSidebar);
        rightIns.setAttribute('data-ad-format', 'auto');
        rightIns.setAttribute('data-full-width-responsive', 'true');
      }

      document.querySelectorAll('ins.adsbygoogle').forEach(slot => {
        if (slot.getAttribute('data-adsbygoogle-status') || slot.offsetParent === null) return;
        const client = slot.getAttribute('data-ad-client') || '';
        const slotId = slot.getAttribute('data-ad-slot') || '';
        const isPlaceholderSlot = !slotId || /^(1111111111|2222222222|3333333333)$/.test(slotId);
        if (client && client !== 'ca-pub-0000000000000000' && !client.includes('XXXX') && !isPlaceholderSlot) {
          try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
          } catch (err) {
            console.warn('AdSense slot init warning:', err);
          }
        }
      });
    }
    initGoogleAds();

    
    function getExperimentHref(sceneKey, lang) {
      const targetLang = (lang || uiState.lang) === 'uk' ? 'uk' : 'en';
      if (window.location.protocol.startsWith('http')) {
        return targetLang === 'uk'
          ? `/uk/sim/${sceneKey}`
          : `/sim/${sceneKey}`;
      }
      const rootPrefix = window.__ROOT_PREFIX__ || '';
      return targetLang === 'uk'
        ? `${rootPrefix}uk/sim/${sceneKey}.html`
        : `${rootPrefix}sim/${sceneKey}.html`;
    }

    function stripHtmlAndMath(str) {
      return String(str || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\$([^$]+)\$/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function syncPageSeoAndUrl(pushHistory = false) {
      const cfg = SCENE_CONFIGS[uiState.activeScene];
      const t = tUI();
      if (!cfg) return;
      document.title = `${cfg.secSym} ${cfg.title} — ${t.docTitle}`;
      const descMeta = document.querySelector('meta[name="description"]');
      if (descMeta) {
        descMeta.setAttribute('content', stripHtmlAndMath(`${cfg.epigraph} ${cfg.question}`).slice(0, 260));
      }
      if (window.location.protocol.startsWith('http')) {
        const isRootPath = /^\/(?:uk\/?)?(?:index\.html)?$/i.test(window.location.pathname);
        const targetUrl = (!pushHistory && isRootPath)
          ? (uiState.lang === 'uk' ? '/uk/' : '/')
          : getExperimentHref(uiState.activeScene, uiState.lang);
        try {
          if (pushHistory) {
            window.history.pushState({ scene: uiState.activeScene, lang: uiState.lang }, '', targetUrl);
          } else {
            window.history.replaceState({ scene: uiState.activeScene, lang: uiState.lang }, '', targetUrl);
          }
        } catch (e) {}
      }
    }

    function loadScene(sceneKey, pushHistory = false) {
      uiState.activeScene = sceneKey;
      uiState.running = false;
      uiState.simTime = 0;
      uiState.selectedOption = null;
      document.getElementById('sim-time-readout').textContent = `t = 0.00 ${tUI().secUnit}`;
      resetChartHistory();

      if (activeSim) {
        try {
          activeSim.dispose();
        } catch (err) {
          console.warn('Error disposing previous simulation:', err);
        }
        activeSim = null;
      }

      if (activeVectorArrows.size > 0) {
        for (const arrow of Array.from(activeVectorArrows)) {
          try {
            arrow.dispose();
          } catch (e) {}
        }
        activeVectorArrows.clear();
      }

      clearGroup3D(worldGroup);

      const cfg = SCENE_CONFIGS[sceneKey];
      controls.autoRotate = false;
      document.querySelectorAll('.view-projections .proj-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('cam-iso').classList.add('active');

      camera.position.set(...cfg.cameraPos);
      controls.target.set(...cfg.cameraTarget);
      controls.update();

      updateDropdownTriggerUI();
      renderQuestionAndSliders();
      transitionToPhase('predict');

      if (sceneKey === 'collision') activeSim = new CollisionSimulation();
      else if (sceneKey === 'incline') activeSim = new InclineSimulation();
      else if (sceneKey === 'pendulum') activeSim = new PendulumSimulation();
      else if (sceneKey === 'projectile') activeSim = new ProjectileSimulation();
      else if (sceneKey === 'cradle') activeSim = new NewtonsCradleSimulation();
      else if (sceneKey === 'centripetal') activeSim = new CentripetalSimulation();
      else if (sceneKey === 'archimedes') activeSim = new ArchimedesSimulation();
      else if (sceneKey === 'gas') activeSim = new IdealGasSimulation();
      else if (sceneKey === 'wavefront') activeSim = new WavefrontHuygensSimulation();
      else if (sceneKey === 'interference') activeSim = new YoungInterferenceSimulation();
      else if (sceneKey === 'dispersion') activeSim = new PrismDispersionSimulation();
      else if (sceneKey === 'emwave') activeSim = new ElectromagneticWaveSimulation();
      else if (sceneKey === 'bernoulli') activeSim = new BernoulliVenturiSimulation();
      else if (sceneKey === 'lens') activeSim = new ConvergingLensWavefrontSimulation();
      else if (sceneKey === 'lorentz') activeSim = new LorentzForceSimulation();
      else if (sceneKey === 'faraday') activeSim = new FaradayInductionSimulation();
      else if (sceneKey === 'kepler') activeSim = new KeplerOrbitSimulation();
      else if (sceneKey === 'gyroscope') activeSim = new RollingInertiaSimulation();
      else if (sceneKey === 'standingwave') activeSim = new StandingWaveSimulation();
      else if (sceneKey === 'doppler') activeSim = new DopplerWavefrontSimulation();
      else if (sceneKey === 'brewster') activeSim = new BrewsterPolarizationSimulation();
      else if (sceneKey === 'diffraction') activeSim = new SingleSlitDiffractionSimulation();
      else if (sceneKey === 'carnot') activeSim = new CarnotEngineSimulation();
      else if (sceneKey === 'viscosity') activeSim = new StokesViscositySimulation();
      else if (sceneKey === 'coulomb') activeSim = new CoulombDipoleSimulation();
      else if (sceneKey === 'rlccircuit') activeSim = new ThomsonRLCSimulation();
      else if (sceneKey === 'atwood') activeSim = new AtwoodMachineSimulation();
      else if (sceneKey === 'coriolis') activeSim = new FoucaultCoriolisSimulation();
      else if (sceneKey === 'hooke') activeSim = new HookeYoungModulusSimulation();
      else if (sceneKey === 'torricelli') activeSim = new TorricelliEffluxSimulation();
      else if (sceneKey === 'maxwell') activeSim = new MaxwellBoltzmannSimulation();
      else if (sceneKey === 'newtonrings') activeSim = new NewtonRingsSimulation();
      else if (sceneKey === 'photoelectric') activeSim = new PhotoelectricEffectSimulation();
      else if (sceneKey === 'rutherford') activeSim = new RutherfordScatteringSimulation();
      else if (sceneKey === 'ampere') activeSim = new AmpereParallelWiresSimulation();
      else if (sceneKey === 'hall') activeSim = new HallEffectSimulation();
      else if (sceneKey === 'coupled') activeSim = new CoupledPendulumsSimulation();
      else if (sceneKey === 'precession') activeSim = new GyroscopePrecessionSimulation();
      else if (sceneKey === 'magnus') activeSim = new MagnusEffectSimulation();
      else if (sceneKey === 'capillary') activeSim = new CapillaryRiseSimulation();
      else if (sceneKey === 'brownian') activeSim = new BrownianMotionSimulation();
      else if (sceneKey === 'michelson') activeSim = new MichelsonInterferometerSimulation();
      else if (sceneKey === 'compton') activeSim = new ComptonScatteringSimulation();
      else if (sceneKey === 'bohr') activeSim = new BohrAtomSimulation();
      else if (sceneKey === 'biot') activeSim = new HelmholtzCoilSimulation();
      else if (sceneKey === 'transformer') activeSim = new TransformerInductionSimulation();
      window.activeSim = activeSim;
      syncPageSeoAndUrl(pushHistory);
    }

    function resetCurrentSimulation(keepPhaseTest = true) {
      uiState.running = false;
      uiState.simTime = 0;
      document.getElementById('sim-time-readout').textContent = `t = 0.00 ${tUI().secUnit}`;
      resetChartHistory();
      if (activeSim) activeSim.reset();
      if (keepPhaseTest && uiState.selectedOption !== null) {
        transitionToPhase(uiState.phase === 'explain' ? 'explain' : 'test');
      }
      syncActionButtons();
    }

    document.getElementById('btn-change-prediction').addEventListener('click', () => {
      transitionToPhase('predict');
    });

    document.getElementById('btn-primary-cta').addEventListener('click', () => {
      if (uiState.phase === 'explain' && uiState.simTime > 0 && !uiState.running) {
        resetCurrentSimulation(true);
        uiState.running = true;
        syncActionButtons();
        return;
      }
      uiState.running = true;
      if (uiState.phase === 'predict' && uiState.selectedOption === null) {
        transitionToPhase('test');
      } else {
        syncActionButtons();
      }
    });

    document.getElementById('btn-pause-toggle').addEventListener('click', () => {
      uiState.running = !uiState.running;
      syncActionButtons();
    });

    document.getElementById('btn-step').addEventListener('click', () => {
      uiState.running = false;
      if (activeSim) {
        uiState.simTime += 0.02;
        document.getElementById('sim-time-readout').textContent = `t = ${uiState.simTime.toFixed(2)} ${tUI().secUnit}`;
        activeSim.update(0.02);
      }
      syncActionButtons();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      resetCurrentSimulation(true);
    });

    document.getElementById('btn-preset-default').addEventListener('click', () => {
      const key = uiState.activeScene;
      sceneParams[key] = { ...SCENE_CONFIGS[key].defaults };
      renderQuestionAndSliders();
      resetCurrentSimulation(uiState.selectedOption !== null);
    });

    document.querySelectorAll('.speed-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        uiState.timeScale = parseFloat(btn.dataset.speed);
      });
    });

    document.getElementById('chk-vectors').addEventListener('change', e => {
      uiState.showVectors = e.target.checked;
      if (activeSim) activeSim.syncVisuals();
    });
    document.getElementById('chk-labels').addEventListener('change', e => {
      uiState.showLabels = e.target.checked;
      if (activeSim) activeSim.syncVisuals();
    });
    document.getElementById('chk-trails').addEventListener('change', e => {
      uiState.showTrails = e.target.checked;
      if (activeSim) activeSim.syncVisuals();
    });
    document.getElementById('chk-particles').addEventListener('change', e => {
      uiState.showParticles = e.target.checked;
      if (!uiState.showParticles && activeSim && activeSim.particles && typeof activeSim.particles.clear === 'function') {
        activeSim.particles.clear();
      }
      if (activeSim) activeSim.syncVisuals();
    });

    // 6 CAMERA PROJECTION VIEWS (Isometric, Front, Plan, Profile, Macro, 360° Orbit)
    function setActiveCamButton(id) {
      document.querySelectorAll('.view-projections .proj-btn').forEach(b => b.classList.remove('active'));
      const btn = document.getElementById(id);
      if (btn) btn.classList.add('active');
    }

    document.getElementById('cam-iso').addEventListener('click', () => {
      setActiveCamButton('cam-iso');
      controls.autoRotate = false;
      const cfg = SCENE_CONFIGS[uiState.activeScene];
      camera.position.set(cfg.cameraTarget[0] + 7.5, cfg.cameraTarget[1] + 5.2, 11.5);
      controls.target.set(...cfg.cameraTarget);
    });
    document.getElementById('cam-front').addEventListener('click', () => {
      setActiveCamButton('cam-front');
      controls.autoRotate = false;
      const cfg = SCENE_CONFIGS[uiState.activeScene];
      camera.position.set(cfg.cameraTarget[0], cfg.cameraTarget[1] + 1.2, 14.5);
      controls.target.set(...cfg.cameraTarget);
    });
    document.getElementById('cam-top').addEventListener('click', () => {
      setActiveCamButton('cam-top');
      controls.autoRotate = false;
      const cfg = SCENE_CONFIGS[uiState.activeScene];
      camera.position.set(cfg.cameraTarget[0], 16.5, 0.01);
      controls.target.set(...cfg.cameraTarget);
    });
    document.getElementById('cam-side').addEventListener('click', () => {
      setActiveCamButton('cam-side');
      controls.autoRotate = false;
      const cfg = SCENE_CONFIGS[uiState.activeScene];
      camera.position.set(cfg.cameraTarget[0] + 14.5, cfg.cameraTarget[1] + 1.5, 0.01);
      controls.target.set(...cfg.cameraTarget);
    });
    document.getElementById('cam-macro').addEventListener('click', () => {
      setActiveCamButton('cam-macro');
      controls.autoRotate = false;
      const cfg = SCENE_CONFIGS[uiState.activeScene];
      camera.position.set(cfg.cameraTarget[0] + 2.2, cfg.cameraTarget[1] + 1.6, 5.4);
      controls.target.set(...cfg.cameraTarget);
    });
    document.getElementById('cam-orbit').addEventListener('click', () => {
      setActiveCamButton('cam-orbit');
      controls.autoRotate = !controls.autoRotate;
      controls.autoRotateSpeed = 2.2;
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      fitMathContainers();
    });

    // Re-render KaTeX formulas and legend once KaTeX finishes loading
    window.addEventListener('load', () => {
      applyLanguage(uiState.lang);
      fitMathContainers();
    });

    // ============================================================================
    // 14. MAIN RENDER & PHYSICS LOOP (requestAnimationFrame + delta-time)
    // ============================================================================
    let lastFrameTime = performance.now();

    function animate(now) {
      requestAnimationFrame(animate);

      const rawDt = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;

      if (uiState.running && activeSim) {
        const scaledDt = rawDt * uiState.timeScale;
        uiState.simTime += scaledDt;
        document.getElementById('sim-time-readout').textContent = `t = ${uiState.simTime.toFixed(2)} ${tUI().secUnit}`;
        activeSim.update(scaledDt);
      }

      controls.update();
      renderer.render(scene, camera);
    }

    // Expose globals for automated diagnostics and external hooks
    Object.assign(window, {
      applyLanguage,
      loadScene,
      SCENE_CONFIGS,
      SCENE_EN,
      SCENE_UK,
      SCENE_KEYS_ORDER,
      sceneParams,
      uiState
    });

    // Resolve initial language and experiment from URL / page metadata
    const urlParams = new URLSearchParams(window.location.search);
    const querySim = urlParams.get('sim');
    const queryLang = urlParams.get('lang');
    const pathMatch = window.location.pathname.match(/(?:^|\/)((?:uk\/)?)sim\/([a-z0-9_]+)(?:\.html)?$/i);
    const isUkRoot = /(?:^|\/)uk\/(?:index\.html)?$/i.test(window.location.pathname);

    const initialLang = (queryLang === 'uk' || queryLang === 'en')
      ? queryLang
      : (window.__INITIAL_LANG__ || (pathMatch && pathMatch[1] ? 'uk' : (isUkRoot ? 'uk' : 'en')));

    const candidateScene = querySim || window.__INITIAL_SCENE__ || (pathMatch && pathMatch[2]) || 'wavefront';
    const initialScene = SCENE_CONFIGS[candidateScene] ? candidateScene : 'wavefront';

    window.addEventListener('popstate', e => {
      if (e.state && e.state.scene && SCENE_CONFIGS[e.state.scene]) {
        if (e.state.lang && e.state.lang !== uiState.lang) {
          applyLanguage(e.state.lang);
        }
        loadScene(e.state.scene, false);
      }
    });

    applyLanguage(initialLang);
    if (document.body.classList.contains('is-mobile-phone') && queryLang !== 'uk') {
      setMobileOverlayLang('en');
    }
    loadScene(initialScene, false);
    requestAnimationFrame(animate);
    window.__PHYSICS_APP_READY__ = true;
    window.dispatchEvent(new CustomEvent('physics-app-ready'));
  
})();
