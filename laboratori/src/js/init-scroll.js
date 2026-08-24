// Navbar scroll effect
window.addEventListener('scroll', () => {
  const nav = document.getElementById('main-navbar');
  if (nav) {
    nav.classList.toggle('navbar-scrolled', window.scrollY > 40);
  }
});

// Reveal animations on scroll
const scrollObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('reveal-visible');
      scrollObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.ptl-item, .sector-card, .testi-card, .req-card').forEach(el => {
  el.classList.add('reveal-item');
  scrollObserver.observe(el);
});
