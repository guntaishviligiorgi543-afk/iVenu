(() => {
  const hero = document.querySelector(".venueHero");
  if (!hero) return;

  const releaseScroll = window.pageLoading?.lock("venue-hero");
  const skeleton = document.createElement("div");
  skeleton.className = "venueHeroSkeleton";
  skeleton.setAttribute("role", "status");
  skeleton.setAttribute("aria-label", "Loading venue details");
  skeleton.innerHTML = '<div class="venueHeroSkeletonContent"><div class="venueHeroSkeletonTitle"><span class="skeletonBlock"></span><span class="skeletonBlock"></span></div><span class="skeletonBlock venueHeroSkeletonImage"></span><span class="skeletonBlock venueHeroSkeletonCopy"></span></div>';

  hero.classList.add("is-loading");
  hero.setAttribute("aria-busy", "true");
  hero.append(skeleton);

  const imageReady = window.pageLoading?.waitForImage(hero.querySelector(".img-Par img")) || Promise.resolve(false);

  imageReady
    .then((imageReady) => {
      if (imageReady === false) hero.classList.add("venueHero--image-fallback");
    })
    .catch(() => {
      hero.classList.add("venueHero--image-fallback");
    })
    .finally(() => {
      skeleton.remove();
      hero.classList.remove("is-loading");
      hero.classList.add("is-ready");
      hero.setAttribute("aria-busy", "false");
      releaseScroll?.();
    });
})();
