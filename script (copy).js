// ============================================================
//  AIMO BOT — CONFIGURATION
// ============================================================
const DISCORD_INVITE  = 'https://discord.com/oauth2/authorize?client_id=1466757680311042060&permissions=8&integration_type=0&scope=bot';
const DISCORD_SUPPORT = 'https://discord.gg/9rSar8Kssg';
const CLIENT_ID       = '1466757680311042060';
const LAVALINK_HOST   = 'lavalinkv4.serenetia.com';
const LAVALINK_PORT   = '443';
const LAVALINK_PASS   = 'https://dsc.gg/ajidevserver';
// ============================================================

// Mobile menu toggle
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    mobileMenu.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.classList.remove('open');
    }
  });
}

// Commands page category filter
const filterBtns  = document.querySelectorAll('.filter-btn');
const cmdSections = document.querySelectorAll('.cmd-section');

if (filterBtns.length > 0) {
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      cmdSections.forEach(section => {
        section.style.display = (cat === 'all' || section.dataset.cat === cat) ? 'block' : 'none';
      });
    });
  });
}

// Scroll-in animation
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.08 });

document.querySelectorAll('.feature-card, .cmd-cat-card, .cmd-item, .cmd-section-header, .status-card, .stat-item').forEach(el => {
  el.classList.add('fade-in');
  observer.observe(el);
});
