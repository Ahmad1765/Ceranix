/**
 * Grabsty Waitlist Funnel — Native Engine
 * Built with Vanilla JavaScript: Zero external dependencies (Ponytail Rule)
 * Featuring: lapz.io Kinetic Velocity Marquee, Emil Kowalski tactile physics,
 * 3D card tilt, 60fps parallax, and accessible ARIA state transitions.
 */

document.addEventListener('DOMContentLoaded', () => {
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = window.matchMedia('(pointer: fine)').matches;

  // ---------------------------------------------------------------------------
  // 1. Dynamic Footer Year & Queue Counter
  // ---------------------------------------------------------------------------
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // ---------------------------------------------------------------------------
  // 2. Scroll Progress Bar
  // ---------------------------------------------------------------------------
  const progressBar = document.getElementById('scroll-progress');
  function updateScrollProgress() {
    if (!progressBar) return;
    const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (totalHeight <= 0) return;
    const progress = Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100));
    progressBar.style.width = `${progress}%`;
  }
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  updateScrollProgress();

  // ---------------------------------------------------------------------------
  // 3. Cursor Ambient Glow
  // ---------------------------------------------------------------------------
  const cursorGlow = document.getElementById('cursor-glow');
  if (cursorGlow && isFinePointer && !isReducedMotion) {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let currentX = mouseX;
    let currentY = mouseY;

    window.addEventListener('pointermove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    function renderGlow() {
      // Smooth lerp for buttery lag
      currentX += (mouseX - currentX) * 0.12;
      currentY += (mouseY - currentY) * 0.12;
      cursorGlow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`;
      requestAnimationFrame(renderGlow);
    }
    requestAnimationFrame(renderGlow);
  } else if (cursorGlow) {
    cursorGlow.style.display = 'none';
  }

  // ---------------------------------------------------------------------------
  // 4. Native Intersection Observer for Scroll Reveals
  // ---------------------------------------------------------------------------
  const revealElements = document.querySelectorAll('.animate-on-scroll');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target); // Free memory once revealed
        }
      });
    }, {
      root: null,
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.12
    });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('in-view'));
  }

  // ---------------------------------------------------------------------------
  // 5. Parallax on Memphis Floating Accents
  // ---------------------------------------------------------------------------
  const shapes = document.querySelectorAll('.memphis-shape');
  if (shapes.length > 0 && !isReducedMotion) {
    let lastScrollY = window.scrollY;
    let ticking = false;

    function updateParallax() {
      const scrollY = window.scrollY;
      shapes.forEach((shape) => {
        const speed = parseFloat(shape.getAttribute('data-speed') || '0.15');
        const rotation = shape.getAttribute('data-rot') || '0';
        const yOffset = scrollY * speed;
        shape.style.transform = `translate3d(0, ${yOffset}px, 0) rotate(${rotation}deg)`;
      });
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      lastScrollY = window.scrollY;
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });
    updateParallax();
  }

  // ---------------------------------------------------------------------------
  // 6. Kinetic Velocity-Coupled Marquee (lapz.io style)
  // ---------------------------------------------------------------------------
  const marqueeTrack = document.getElementById('marquee-track');
  if (marqueeTrack && !isReducedMotion) {
    let marqueePos = 0;
    const baseSpeed = 0.85; // pixels per frame
    let scrollVelocity = 0;
    let lastScrollPos = window.scrollY;
    let lastScrollTime = performance.now();

    window.addEventListener('scroll', () => {
      const now = performance.now();
      const dt = Math.max(1, now - lastScrollTime);
      const dy = window.scrollY - lastScrollPos;
      scrollVelocity = (dy / dt) * 8; // amplify scroll speed
      lastScrollPos = window.scrollY;
      lastScrollTime = now;
    }, { passive: true });

    function tickMarquee() {
      // Decay velocity back to 0
      scrollVelocity *= 0.94;
      const currentSpeed = baseSpeed + Math.abs(scrollVelocity);

      marqueePos -= currentSpeed;

      // Halfway reset for seamless infinite loop
      const streamEl = marqueeTrack.querySelector('.marquee-stream');
      if (streamEl) {
        const streamWidth = streamEl.offsetWidth;
        if (Math.abs(marqueePos) >= streamWidth) {
          marqueePos = 0;
        }
      }

      marqueeTrack.style.transform = `translate3d(${marqueePos}px, 0, 0)`;
      requestAnimationFrame(tickMarquee);
    }
    requestAnimationFrame(tickMarquee);
  }

  // ---------------------------------------------------------------------------
  // 7. Magnetic CTA Button (Fine pointer only)
  // ---------------------------------------------------------------------------
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn && isFinePointer && !isReducedMotion) {
    submitBtn.addEventListener('mousemove', (e) => {
      const rect = submitBtn.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) * 0.28;
      const y = (e.clientY - rect.top - rect.height / 2) * 0.28;
      submitBtn.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });

    submitBtn.addEventListener('mouseleave', () => {
      submitBtn.style.transform = 'translate3d(0, 0, 0)';
    });
  }

  // ---------------------------------------------------------------------------
  // 8. 3D Tilt on Bento Cards (Fine pointer only)
  // ---------------------------------------------------------------------------
  const bentoCards = document.querySelectorAll('.bento-card');
  if (isFinePointer && !isReducedMotion) {
    bentoCards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -6;
        const rotateY = ((x - centerX) / centerX) * 6;

        card.style.setProperty('--rotate-x', `${rotateX.toFixed(2)}deg`);
        card.style.setProperty('--rotate-y', `${rotateY.toFixed(2)}deg`);
        card.style.setProperty('--lift-y', '-6px');
      });

      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--rotate-x', '0deg');
        card.style.setProperty('--rotate-y', '0deg');
        card.style.setProperty('--lift-y', '0px');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 9. Supabase & Persistence Configuration (Zero external libraries)
  // ---------------------------------------------------------------------------
  const SUPABASE_CONFIG = {
    url: 'https://ttxestvncdynsssmjqhk.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0eGVzdHZuY2R5bnNzc21qcWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODM4ODcsImV4cCI6MjA5MTY1OTg4N30.G9nazXwNsD5nTKKALfF8OZqFOEx2ockqtjKn9XhDilA',
    tableName: 'waitlist'
  };

  // ---------------------------------------------------------------------------
  // 10. Cohort 01 Capacity Bar & Scarcity Tracker
  // ---------------------------------------------------------------------------
  const COHORT_CAP = 5000;
  const BASE_CLAIMED = 4821;
  let currentClaimed = BASE_CLAIMED;

  const capacityClaimedEl = document.getElementById('capacity-claimed');
  const capacityPctEl = document.getElementById('capacity-pct');
  const capacityRemainingEl = document.getElementById('capacity-remaining');
  const cohortProgressFill = document.getElementById('cohort-progress-fill');
  const queueCounter = document.getElementById('queue-counter');

  function updateCapacityDisplay(claimed) {
    const pct = ((claimed / COHORT_CAP) * 100).toFixed(1);
    const remaining = Math.max(0, COHORT_CAP - claimed);

    if (capacityClaimedEl) capacityClaimedEl.textContent = claimed.toLocaleString();
    if (capacityPctEl) capacityPctEl.textContent = `${pct}%`;
    if (capacityRemainingEl) capacityRemainingEl.textContent = remaining.toLocaleString();
    if (queueCounter) queueCounter.textContent = claimed.toLocaleString();
    if (cohortProgressFill) cohortProgressFill.style.width = `${Math.min(100, pct)}%`;
  }
  updateCapacityDisplay(currentClaimed);

  // Live count sync from Supabase if table exists
  async function fetchLiveSupabaseCount() {
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.tableName}?select=count`, {
        method: 'HEAD',
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Range': '0-0',
          'Prefer': 'count=exact'
        }
      });
      if (res.ok) {
        const range = res.headers.get('content-range');
        if (range && range.includes('/')) {
          const dbCount = parseInt(range.split('/')[1], 10);
          if (!isNaN(dbCount) && dbCount > 0) {
            currentClaimed = BASE_CLAIMED + dbCount;
            updateCapacityDisplay(currentClaimed);
          }
        }
      }
    } catch {
      // Gracefully fall back to local count
    }
  }
  fetchLiveSupabaseCount();

  // ---------------------------------------------------------------------------
  // 11. Referral Ingestion (?ref= query param)
  // ---------------------------------------------------------------------------
  const urlParams = new URLSearchParams(window.location.search);
  const referredByCode = urlParams.get('ref') ? urlParams.get('ref').trim().toUpperCase() : null;
  const referralBanner = document.getElementById('referral-banner');
  const referrerCodeEl = document.getElementById('referrer-code');

  if (referredByCode && referralBanner && referrerCodeEl) {
    referrerCodeEl.textContent = referredByCode.startsWith('#') ? referredByCode : `#${referredByCode}`;
    referralBanner.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // 12. Participant Role Selector (Buyer / Seller / Both)
  // ---------------------------------------------------------------------------
  const rolePills = document.querySelectorAll('.role-pill');
  const selectedRoleInput = document.getElementById('selected-role');
  let currentRole = 'buyer';

  rolePills.forEach(pill => {
    pill.addEventListener('click', () => {
      rolePills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-checked', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-checked', 'true');
      currentRole = pill.getAttribute('data-role') || 'buyer';
      if (selectedRoleInput) {
        selectedRoleInput.value = currentRole;
      }
    });

    // Accessible arrow navigation for radiogroup
    pill.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        const next = pill.nextElementSibling || rolePills[0];
        next.focus();
        next.click();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        const prev = pill.previousElementSibling || rolePills[rolePills.length - 1];
        prev.focus();
        prev.click();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 13. Dual Persistence Engine (LocalStorage + Supabase REST)
  // ---------------------------------------------------------------------------
  function getLocalWaitlist() {
    try {
      return JSON.parse(localStorage.getItem('grabsty_waitlist') || '[]');
    } catch {
      return [];
    }
  }

  function saveToLocalStorage(record) {
    try {
      const stored = getLocalWaitlist();
      const existingIdx = stored.findIndex(item => item.email.toLowerCase() === record.email.toLowerCase());
      if (existingIdx >= 0) {
        stored[existingIdx] = { ...stored[existingIdx], ...record };
      } else {
        stored.push(record);
      }
      localStorage.setItem('grabsty_waitlist', JSON.stringify(stored));
      // Store current user identifier for quick restore
      localStorage.setItem('grabsty_last_email', record.email);
    } catch (err) {
      console.warn('LocalStorage save warning:', err);
    }
  }

  async function postToSupabase(record) {
    try {
      const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.tableName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(record)
      });

      if (response.status === 201 || response.ok) {
        return { success: true, status: response.status };
      }

      // Handle duplicate email (409 Conflict)
      if (response.status === 409) {
        return { success: false, status: 409, conflict: true };
      }

      const errText = await response.text();
      return { success: false, status: response.status, error: errText };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function fetchUserFromSupabase(email) {
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.tableName}?email=eq.${encodeURIComponent(email)}&select=*`, {
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) return data[0];
      }
    } catch {}
    return null;
  }

  // ---------------------------------------------------------------------------
  // 14. Live Referral Tracker
  // ---------------------------------------------------------------------------
  async function updateLiveReferralStats(ticketCode) {
    let count = 0;
    const cleanCode = ticketCode.replace(/^#/, '');

    // 1. Try Supabase count
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.tableName}?referred_by=eq.${encodeURIComponent(cleanCode)}&select=count`, {
        method: 'HEAD',
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Range': '0-0',
          'Prefer': 'count=exact'
        }
      });
      if (res.ok) {
        const range = res.headers.get('content-range');
        if (range && range.includes('/')) {
          count = parseInt(range.split('/')[1], 10) || 0;
        }
      }
    } catch {}

    // 2. Cross-reference local storage referrals
    const localEntries = getLocalWaitlist();
    const localCount = localEntries.filter(e => e.referred_by === cleanCode || e.referred_by === `#${cleanCode}`).length;
    count = Math.max(count, localCount);

    const refCountText = document.getElementById('ref-count-text');
    if (refCountText) {
      if (count > 0) {
        const spotsJumped = count * 50;
        refCountText.innerHTML = `<strong>${count} Collector${count > 1 ? 's' : ''} Invited</strong> &bull; Jumped ${spotsJumped} spots forward ⚡`;
      } else {
        refCountText.textContent = '0 Referrals Tracked • Priority Queue Locked';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 15. Success State / Passport Presentation
  // ---------------------------------------------------------------------------
  const formContainer = document.getElementById('form-container');
  const successContainer = document.getElementById('success-container');
  const successQueueTag = document.getElementById('success-queue-tag');
  const successTitle = document.getElementById('success-title');
  const successMessage = document.getElementById('success-message');
  const confirmedEmail = document.getElementById('confirmed-email');
  const confirmedRole = document.getElementById('confirmed-role');
  const ticketNumber = document.getElementById('ticket-number');
  const referralLinkInput = document.getElementById('referral-link-input');
  const copyRefBtn = document.getElementById('copy-ref-btn');
  const shareXBtn = document.getElementById('share-x-btn');
  const shareWaBtn = document.getElementById('share-wa-btn');
  const nativeShareBtn = document.getElementById('native-share-btn');
  const downloadPassBtn = document.getElementById('download-pass-btn');
  const backToFormBtn = document.getElementById('back-to-form-btn');

  let activePassportData = null;

  function renderPassportCard({ email, role, ticketCode, isReturning }) {
    activePassportData = { email, role, ticketCode };

    const siteBase = window.location.origin + window.location.pathname.replace(/\/$/, '');
    const cleanCode = ticketCode.replace(/^#/, '');
    const uniqueRefUrl = `${siteBase}?ref=${cleanCode}`;

    if (ticketNumber) ticketNumber.textContent = `#${cleanCode}`;
    if (confirmedEmail) confirmedEmail.textContent = email;

    if (confirmedRole) {
      const roleLabels = { buyer: 'COLLECTOR', seller: 'ARCHIVIST', both: 'HYBRID' };
      confirmedRole.textContent = roleLabels[role] || 'COLLECTOR';
    }

    if (isReturning) {
      if (successQueueTag) successQueueTag.textContent = 'WELCOME BACK • PASSPORT ACTIVE';
      if (successTitle) successTitle.textContent = 'Passport Retrieved!';
      if (successMessage) {
        successMessage.textContent = 'Your private alpha reservation is confirmed. Keep sharing your passport link to move further up the queue.';
      }
    } else {
      if (successQueueTag) successQueueTag.textContent = 'POSITION CONFIRMED';
      if (successTitle) successTitle.textContent = "You're On The Waitlist!";
      if (successMessage) {
        successMessage.textContent = "We'll send your private invite key the moment Cohort 01 access begins. Keep your wardrobe archive ready.";
      }
    }

    if (referralLinkInput) {
      referralLinkInput.value = uniqueRefUrl;
    }

    // Social Sharing Links
    if (shareXBtn) {
      const xText = encodeURIComponent(`Just claimed my Alpha Passport for @Grabsty — resale fashion stripped of clutter. Join Cohort 01 private waitlist: ${uniqueRefUrl}`);
      shareXBtn.href = `https://twitter.com/intent/tweet?text=${xText}`;
    }

    if (shareWaBtn) {
      const waText = encodeURIComponent(`Join Cohort 01 on Grabsty (archival resale, guaranteed escrow protection): ${uniqueRefUrl}`);
      shareWaBtn.href = `https://api.whatsapp.com/send?text=${waText}`;
    }

    if (nativeShareBtn && typeof navigator.share === 'function') {
      nativeShareBtn.classList.remove('hidden');
      nativeShareBtn.onclick = () => {
        navigator.share({
          title: 'Grabsty — Alpha Passport',
          text: 'Resale fashion stripped of clutter. Join Cohort 01 with guaranteed escrow protection.',
          url: uniqueRefUrl
        }).catch(() => {});
      };
    }

    // Refresh live referral stats
    updateLiveReferralStats(cleanCode);

    // Crossfade to Success State
    formContainer.classList.add('hidden');
    successContainer.classList.remove('hidden');
    successContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------------------------------------------------------------------------
  // 16. Waitlist Form Submission
  // ---------------------------------------------------------------------------
  const waitlistForm = document.getElementById('waitlist-form');
  const emailInput = document.getElementById('email');
  const emailError = document.getElementById('email-error');

  function validateEmail(email) {
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return re.test(String(email).toLowerCase().trim());
  }

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      if (emailInput.classList.contains('has-error')) {
        emailInput.classList.remove('has-error');
        if (emailError) emailError.textContent = '';
      }
    });
  }

  if (waitlistForm) {
    waitlistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailVal = emailInput.value.trim().toLowerCase();

      if (!validateEmail(emailVal)) {
        emailInput.classList.add('has-error');
        if (emailError) {
          emailError.textContent = 'Please enter a valid archival email address.';
        }
        emailInput.focus();
        return;
      }

      // Check if user already registered locally first
      const localUsers = getLocalWaitlist();
      const existingLocal = localUsers.find(u => u.email.toLowerCase() === emailVal);
      if (existingLocal) {
        renderPassportCard({
          email: existingLocal.email,
          role: existingLocal.role || currentRole,
          ticketCode: existingLocal.referral_code || `GRB-${existingLocal.ticket_number}`,
          isReturning: true
        });
        return;
      }

      // Enter Loading State
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
      const btnText = submitBtn.querySelector('.btn-text');
      if (btnText) btnText.textContent = 'VERIFYING...';

      const nextQueue = currentClaimed + 1;
      const ticketCode = `GRB-${nextQueue}`;

      const payload = {
        email: emailVal,
        role: currentRole,
        ticket_number: nextQueue,
        referral_code: ticketCode,
        referred_by: referredByCode || null,
        created_at: new Date().toISOString()
      };

      // Save locally immediately (offline-first resilience)
      saveToLocalStorage({ ...payload, synced: false });

      // Dispatch to Supabase with timeout race
      let supabaseResp = null;
      try {
        const [res] = await Promise.allSettled([
          postToSupabase(payload),
          new Promise(resolve => setTimeout(resolve, 600))
        ]);
        supabaseResp = res.status === 'fulfilled' ? res.value : null;
      } catch {}

      // Handle 409 Conflict (User already exists in Supabase DB)
      if (supabaseResp && supabaseResp.conflict) {
        const existingRemote = await fetchUserFromSupabase(emailVal);
        if (existingRemote) {
          saveToLocalStorage({ ...existingRemote, synced: true });
          submitBtn.disabled = false;
          submitBtn.classList.remove('loading');
          if (btnText) btnText.textContent = 'JOIN WAITLIST';
          renderPassportCard({
            email: existingRemote.email,
            role: existingRemote.role || 'buyer',
            ticketCode: existingRemote.referral_code || `GRB-${existingRemote.ticket_number}`,
            isReturning: true
          });
          return;
        }
      }

      // Successful new registration
      currentClaimed = nextQueue;
      updateCapacityDisplay(currentClaimed);

      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
      if (btnText) btnText.textContent = 'JOIN WAITLIST';

      renderPassportCard({
        email: emailVal,
        role: currentRole,
        ticketCode: ticketCode,
        isReturning: false
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 17. Lookup Toggle ("Already Registered?")
  // ---------------------------------------------------------------------------
  const lookupToggleBtn = document.getElementById('lookup-toggle-btn');
  if (lookupToggleBtn) {
    lookupToggleBtn.addEventListener('click', async () => {
      const lastEmail = localStorage.getItem('grabsty_last_email');
      const localUsers = getLocalWaitlist();

      if (lastEmail) {
        const match = localUsers.find(u => u.email.toLowerCase() === lastEmail.toLowerCase());
        if (match) {
          renderPassportCard({
            email: match.email,
            role: match.role || 'buyer',
            ticketCode: match.referral_code || `GRB-${match.ticket_number}`,
            isReturning: true
          });
          return;
        }
      }

      if (localUsers.length > 0) {
        const first = localUsers[localUsers.length - 1];
        renderPassportCard({
          email: first.email,
          role: first.role || 'buyer',
          ticketCode: first.referral_code || `GRB-${first.ticket_number}`,
          isReturning: true
        });
        return;
      }

      // Prompt to type email
      if (emailInput) {
        emailInput.focus();
        emailInput.placeholder = 'Type your registered email...';
        if (emailError) {
          emailError.style.color = 'var(--paper)';
          emailError.textContent = 'Enter your email above and hit Join to retrieve your passport.';
          setTimeout(() => {
            emailError.textContent = '';
            emailError.style.color = '';
          }, 3500);
        }
      }
    });
  }

  // Back button to return to registration form
  if (backToFormBtn) {
    backToFormBtn.addEventListener('click', () => {
      successContainer.classList.add('hidden');
      formContainer.classList.remove('hidden');
      if (emailInput) {
        emailInput.value = '';
        emailInput.placeholder = 'name@archival.com';
        emailInput.focus();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 18. Tactile Multi-Stage Clipboard Copy
  // ---------------------------------------------------------------------------
  if (copyRefBtn && referralLinkInput) {
    copyRefBtn.addEventListener('click', async () => {
      const link = referralLinkInput.value;
      let copiedSuccess = false;

      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(link);
          copiedSuccess = true;
        } catch {
          copiedSuccess = false;
        }
      }

      if (!copiedSuccess) {
        try {
          referralLinkInput.select();
          referralLinkInput.setSelectionRange(0, 99999);
          copiedSuccess = document.execCommand('copy');
        } catch {
          copiedSuccess = false;
        }
      }

      copyRefBtn.classList.add('copied');
      const copyTextEl = copyRefBtn.querySelector('.copy-text');
      if (copyTextEl) copyTextEl.textContent = 'COPIED! ✓';

      setTimeout(() => {
        copyRefBtn.classList.remove('copied');
        if (copyTextEl) copyTextEl.textContent = 'COPY LINK';
      }, 2400);
    });
  }

  // ---------------------------------------------------------------------------
  // 19. Native Client-Side Canvas Passport PNG Generator
  // ---------------------------------------------------------------------------
  if (downloadPassBtn) {
    downloadPassBtn.addEventListener('click', () => {
      if (!activePassportData) return;
      const canvas = document.getElementById('passport-canvas');
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const w = 1200;
      const h = 630;
      canvas.width = w;
      canvas.height = h;

      const { email, role, ticketCode } = activePassportData;
      const cleanCode = ticketCode.replace(/^#/, '');

      // Dark Ink Background
      ctx.fillStyle = '#0F0F0F';
      ctx.fillRect(0, 0, w, h);

      // Blueprint dot matrix
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let x = 20; x < w; x += 30) {
        for (let y = 20; y < h; y += 30) {
          ctx.fillRect(x, y, 2, 2);
        }
      }

      // Purple brutalist drop shadow & card frame
      ctx.fillStyle = '#6C47FF';
      ctx.fillRect(58, 58, w - 100, h - 100);

      ctx.fillStyle = '#171717';
      ctx.fillRect(50, 50, w - 100, h - 100);

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.strokeRect(50, 50, w - 100, h - 100);

      // Tag
      ctx.fillStyle = '#6C47FF';
      ctx.fillRect(85, 85, 175, 38);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px "JetBrains Mono", monospace';
      ctx.fillText('COHORT 01 ALPHA', 105, 110);

      // Brand Title
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 48px Inter, sans-serif';
      ctx.fillText('GRABSTY', 285, 114);

      ctx.fillStyle = '#6C47FF';
      ctx.beginPath();
      ctx.arc(508, 102, 6, 0, Math.PI * 2);
      ctx.fill();

      // Subtitle
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '16px Inter, sans-serif';
      ctx.fillText('RESALE FASHION STRIPPED OF CLUTTER • ALPHA PASSPORT', 85, 168);

      // Divider
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(85, 195);
      ctx.lineTo(w - 85, 195);
      ctx.stroke();

      // Large Ticket Number
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 64px "JetBrains Mono", monospace';
      ctx.fillText(`#${cleanCode}`, 85, 285);

      // Role Badge
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(85, 315, 210, 44);
      ctx.fillStyle = '#0F0F0F';
      ctx.font = '900 18px "JetBrains Mono", monospace';
      ctx.fillText(`ROLE: ${role.toUpperCase()}`, 105, 344);

      // User Email
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '500 24px "JetBrains Mono", monospace';
      ctx.fillText(email, 85, 415);

      // Security Protocol Box
      ctx.fillStyle = '#1F1F1F';
      ctx.fillRect(720, 235, 395, 205);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.strokeRect(720, 235, 395, 205);

      ctx.fillStyle = '#6C47FF';
      ctx.font = 'bold 15px "JetBrains Mono", monospace';
      ctx.fillText('PROTOCOL VERIFICATION', 745, 275);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px Inter, sans-serif';
      ctx.fillText('✓ Guaranteed Buyer Escrow', 745, 315);
      ctx.fillText('✓ 72-Hour Physical Inspection', 745, 350);
      ctx.fillText('✓ Zero Gamification / Zero Ads', 745, 385);

      // Bottom Banner
      ctx.fillStyle = '#6C47FF';
      ctx.fillRect(50, h - 110, w - 100, 60);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 18px "JetBrains Mono", monospace';
      ctx.fillText('INVITE FELLOW COLLECTORS TO JUMP 50 SPOTS FORWARD', 85, h - 74);
      ctx.font = 'bold 16px "JetBrains Mono", monospace';
      ctx.fillText(`REF: ${cleanCode}`, w - 235, h - 74);

      // Save as PNG
      const link = document.createElement('a');
      link.download = `grabsty-alpha-passport-${cleanCode}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // ---------------------------------------------------------------------------
  // 20. Admin CSV Export Shortcut (Ctrl+Shift+E or Cmd+Shift+E)
  // ---------------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      try {
        const stored = getLocalWaitlist();
        if (stored.length === 0) {
          alert('No local waitlist signups recorded yet on this browser.');
          return;
        }
        const headers = ['Email', 'Role', 'Ticket Number', 'Referral Code', 'Referred By', 'Created At'];
        const rows = stored.map(s => [
          `"${s.email || ''}"`,
          `"${s.role || ''}"`,
          `"${s.ticket_number || ''}"`,
          `"${s.referral_code || ''}"`,
          `"${s.referred_by || ''}"`,
          `"${s.created_at || ''}"`
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `grabsty_waitlist_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error('CSV export failed:', err);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 10. Smooth Accordion Handling
  // ---------------------------------------------------------------------------
  const faqDetails = document.querySelectorAll('.faq-item');
  faqDetails.forEach(detail => {
    detail.addEventListener('toggle', () => {
      if (detail.open) {
        faqDetails.forEach(other => {
          if (other !== detail && other.open) {
            other.removeAttribute('open');
          }
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Smooth Navigation & Focus Anchor Handling
  // ---------------------------------------------------------------------------
  document.querySelectorAll('a[href="#waitlist-section"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('waitlist-section');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          if (emailInput && !emailInput.disabled) {
            emailInput.focus();
          }
        }, 450);
      }
    });
  });
});
