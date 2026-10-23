(() => {
  'use strict';

  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.primary-nav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Open navigation');
    }));
  }

  const year = document.getElementById('current-year');
  if (year) year.textContent = new Date().getFullYear();

  // Lightweight decorative globe. If Three.js is unavailable, the styled
  // CSS globe remains visible as a fallback.
  const stage = document.getElementById('globe-stage');
  if (!stage || !window.THREE) return;
  try {
    const THREE = window.THREE;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.z = 5.2;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    stage.innerHTML = '';
    stage.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    const sphereGeometry = new THREE.SphereGeometry(1.38, 64, 48);
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b6429, metalness: 0.78, roughness: 0.32,
      emissive: 0x291b08, emissiveIntensity: 0.32
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    globeGroup.add(sphere);

    // Gold latitude and longitude lines give the globe a luxury wireframe look.
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(1.397, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xe9c477, wireframe: true, transparent: true, opacity: 0.55 })
    );
    globeGroup.add(wire);

    const points = [];
    for (let i = 0; i < 260; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 1.415;
      points.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      ));
    }
    const pointGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const pointMaterial = new THREE.PointsMaterial({ color: 0xffe3a0, size: 0.025, transparent: true, opacity: 0.95 });
    globeGroup.add(new THREE.Points(pointGeometry, pointMaterial));

    const ambient = new THREE.AmbientLight(0xffe8c0, 2.1);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffd88b, 3.4);
    keyLight.position.set(-3, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0xd49b3d, 15, 10);
    rimLight.position.set(3, -1, -3);
    scene.add(rimLight);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (!reducedMotion) {
        globeGroup.rotation.y += 0.0018;
        globeGroup.rotation.x = Math.sin(Date.now() * 0.00025) * 0.035;
      }
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      const width = stage.clientWidth || 1;
      const height = stage.clientHeight || width;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    window.addEventListener('beforeunload', () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      sphereGeometry.dispose(); sphereMaterial.dispose();
      wire.geometry.dispose(); wire.material.dispose();
      pointGeometry.dispose(); pointMaterial.dispose();
      renderer.dispose();
    }, { once: true });
  } catch (error) {
    console.warn('Decorative 3D globe could not initialize; CSS fallback remains available.', error);
  }
})();
