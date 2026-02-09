(() => {
  const mediaLayer = document.getElementById('media-layer');
  const tweetLayer = document.getElementById('tweet-layer');
  const authorLayer = document.getElementById('author-layer');
  const textLayer = document.getElementById('text-layer');

  let overlayConfig = {
    serverUrl: null,
    clientToken: null,
    guildId: null,
    clientId: null,
    volume: 1,
    showText: true,
  };

  let resetTimer = null;
  let twitterWidgetsPromise = null;
  let vidstackReadyPromise = null;

  const clearTimer = () => {
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
  };

  const clearOverlay = () => {
    clearTimer();
    mediaLayer.innerHTML = '';
    tweetLayer.innerHTML = '';
    tweetLayer.style.display = 'none';
    authorLayer.innerHTML = '';
    authorLayer.style.display = 'none';
    textLayer.innerHTML = '';
    textLayer.style.display = 'none';
  };

  const createAvatarNode = (authorName, authorImage) => {
    if (authorImage) {
      const avatarImage = document.createElement('img');
      avatarImage.className = 'overlay-author-avatar';
      avatarImage.src = authorImage;
      avatarImage.alt = authorName;
      avatarImage.referrerPolicy = 'no-referrer';
      avatarImage.addEventListener('error', () => {
        avatarImage.replaceWith(createAvatarNode(authorName, null));
      });
      return avatarImage;
    }

    const fallback = document.createElement('div');
    fallback.className = 'overlay-author-avatar-fallback';
    fallback.textContent = (authorName || '?').trim().charAt(0).toUpperCase() || '?';
    return fallback;
  };

  const applyOverlayInfo = (payload) => {
    if (!overlayConfig.showText) {
      authorLayer.innerHTML = '';
      authorLayer.style.display = 'none';
      textLayer.innerHTML = '';
      textLayer.style.display = 'none';
      return;
    }

    const textEnabled = payload?.text?.enabled === true;
    const textValue = (payload?.text?.value || '').trim();
    const authorEnabled = payload?.author?.enabled === true;
    const authorName = (payload?.author?.name || '').trim();
    const authorImage = typeof payload?.author?.image === 'string' ? payload.author.image.trim() : null;
    const showAuthor = authorEnabled && authorName !== '';
    const showText = textEnabled && textValue !== '';

    if (!showAuthor && !showText) {
      authorLayer.innerHTML = '';
      authorLayer.style.display = 'none';
      textLayer.innerHTML = '';
      textLayer.style.display = 'none';
      return;
    }

    if (showAuthor) {
      authorLayer.innerHTML = '';

      const authorNode = document.createElement('div');
      authorNode.className = 'overlay-author';

      authorNode.appendChild(createAvatarNode(authorName, authorImage));

      const authorNameNode = document.createElement('div');
      authorNameNode.className = 'overlay-author-name';
      authorNameNode.textContent = authorName;
      authorNode.appendChild(authorNameNode);

      authorLayer.appendChild(authorNode);
      authorLayer.style.display = 'block';
    } else {
      authorLayer.innerHTML = '';
      authorLayer.style.display = 'none';
    }

    if (showText) {
      textLayer.innerHTML = '';
      const metaNode = document.createElement('div');
      metaNode.className = 'overlay-meta';

      const textNode = document.createElement('div');
      textNode.className = 'overlay-text-value';
      textNode.textContent = textValue;
      metaNode.appendChild(textNode);

      textLayer.appendChild(metaNode);
      textLayer.style.display = 'block';
    } else {
      textLayer.innerHTML = '';
      textLayer.style.display = 'none';
    }
  };

  const createNativeMediaElement = (kind) => {
    if (kind === 'audio') {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.controls = false;
      audio.preload = 'auto';
      return audio;
    }

    const video = document.createElement('video');
    video.autoplay = true;
    video.controls = false;
    video.playsInline = true;
    video.preload = 'auto';
    return video;
  };

  const waitForVidstackRuntime = () => {
    if (window.customElements?.get('media-player')) {
      return Promise.resolve(true);
    }

    if (vidstackReadyPromise) {
      return vidstackReadyPromise;
    }

    vidstackReadyPromise = new Promise((resolve) => {
      const timeoutAt = Date.now() + 4000;

      const poll = () => {
        if (window.customElements?.get('media-player')) {
          resolve(true);
          return;
        }

        if (Date.now() >= timeoutAt) {
          resolve(false);
          return;
        }

        setTimeout(poll, 40);
      };

      poll();
    });

    return vidstackReadyPromise;
  };

  const createVidstackPlayer = (kind, mediaUrl) => {
    const player = document.createElement('media-player');
    player.className = 'overlay-media-player';
    player.setAttribute('src', mediaUrl);
    player.setAttribute('load', 'eager');
    player.setAttribute('stream-type', 'on-demand');
    player.setAttribute('playsinline', '');
    player.setAttribute('autoplay', '');
    player.setAttribute('crossorigin', '');
    player.setAttribute('view-type', kind === 'audio' ? 'audio' : 'video');

    const provider = document.createElement('media-provider');
    player.appendChild(provider);

    return player;
  };

  const createMediaElement = async (kind, mediaUrl) => {
    if (kind === 'image') {
      const image = document.createElement('img');
      image.src = mediaUrl;
      return image;
    }

    const canUseVidstack = await waitForVidstackRuntime();

    if (!canUseVidstack) {
      const fallback = createNativeMediaElement(kind);
      fallback.src = mediaUrl;
      return fallback;
    }

    return createVidstackPlayer(kind, mediaUrl);
  };

  const applyVolume = () => {
    const mediaElements = mediaLayer.querySelectorAll('audio,video,media-player');
    mediaElements.forEach((element) => {
      try {
        element.volume = overlayConfig.volume;
      } catch (_error) {
        // Ignore elements without volume property.
      }

      try {
        element.muted = false;
      } catch (_error) {
        // Ignore elements without muted property.
      }
    });
  };

  const normalizeOrigin = (url) => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  };

  const isOverlayTempPath = (pathname) => {
    return pathname === '/overlay/temp' || pathname.startsWith('/overlay/temp/');
  };

  const shouldAppendToken = (url) => {
    if (!overlayConfig.clientToken) {
      return false;
    }

    try {
      if (url.startsWith('/overlay/temp/')) {
        return true;
      }

      const parsedMediaUrl = new URL(url, overlayConfig.serverUrl || undefined);

      if (!isOverlayTempPath(parsedMediaUrl.pathname)) {
        return false;
      }

      if (!overlayConfig.serverUrl) {
        return true;
      }

      const serverOrigin = normalizeOrigin(overlayConfig.serverUrl);
      return !!serverOrigin && parsedMediaUrl.origin === serverOrigin;
    } catch {
      return false;
    }
  };

  const buildAuthorizedMediaUrl = (url) => {
    if (!shouldAppendToken(url)) {
      return url;
    }

    try {
      const parsed = new URL(url, overlayConfig.serverUrl || undefined);

      if (!parsed.searchParams.has('token')) {
        parsed.searchParams.set('token', overlayConfig.clientToken);
      }

      return parsed.toString();
    } catch {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}token=${encodeURIComponent(overlayConfig.clientToken)}`;
    }
  };

  const ensureTwitterWidgets = async () => {
    if (window.twttr?.widgets?.load) {
      return window.twttr;
    }

    if (twitterWidgetsPromise) {
      return twitterWidgetsPromise;
    }

    twitterWidgetsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;

      script.onload = () => {
        resolve(window.twttr || null);
      };

      script.onerror = () => {
        reject(new Error('twitter_widgets_load_failed'));
      };

      document.head.appendChild(script);
    }).catch((error) => {
      twitterWidgetsPromise = null;
      throw error;
    });

    return twitterWidgetsPromise;
  };

  const renderTweetCard = async (tweetCard) => {
    if (!tweetCard?.html) {
      return false;
    }

    tweetLayer.innerHTML = '';

    const cardNode = document.createElement('div');
    cardNode.className = 'overlay-tweet-card';

    const caption = (tweetCard.caption || '').trim();
    if (caption) {
      const captionNode = document.createElement('div');
      captionNode.className = 'overlay-tweet-caption';
      captionNode.textContent = caption;
      cardNode.appendChild(captionNode);
    }

    const embedNode = document.createElement('div');
    embedNode.className = 'overlay-tweet-embed';
    embedNode.innerHTML = tweetCard.html;

    cardNode.appendChild(embedNode);
    tweetLayer.appendChild(cardNode);
    tweetLayer.style.display = 'flex';

    try {
      await ensureTwitterWidgets();
      window.twttr?.widgets?.load(embedNode);
    } catch (error) {
      console.error('Twitter widgets load failed:', error);
    }

    return true;
  };

  const renderMedia = async (payload) => {
    if (!payload?.media) {
      return;
    }

    const mediaUrl = buildAuthorizedMediaUrl(payload.media.url);
    const element = await createMediaElement(payload.media.kind, mediaUrl);
    mediaLayer.appendChild(element);

    applyVolume();

    if (payload.media.kind !== 'image') {
      try {
        if (typeof element.play === 'function') {
          await element.play();
        }
      } catch (error) {
        console.error('Autoplay failed:', error);
      }

      element.addEventListener(
        'ended',
        () => {
          clearOverlay();
        },
        { once: true },
      );
    }
  };

  const onPlay = async (payload) => {
    clearOverlay();

    try {
      if (payload?.tweetCard) {
        await renderTweetCard(payload.tweetCard);
      } else {
        applyOverlayInfo(payload);
        await renderMedia(payload);
      }
    } catch (error) {
      console.error('Media render failed:', error);
      window.livechatOverlay.reportError({
        jobId: payload?.jobId || 'unknown-job',
        code: 'render_failed',
        message: error?.message || 'unknown_render_error',
      });
      clearOverlay();
      return;
    }

    if (payload?.durationSec) {
      resetTimer = setTimeout(() => {
        clearOverlay();
      }, payload.durationSec * 1000 + 100);
    }
  };

  const onSettings = (nextSettings) => {
    overlayConfig = {
      ...overlayConfig,
      ...nextSettings,
    };

    if (!overlayConfig.showText) {
      authorLayer.innerHTML = '';
      authorLayer.style.display = 'none';
      textLayer.innerHTML = '';
      textLayer.style.display = 'none';
    }

    applyVolume();
  };

  const bootstrap = async () => {
    overlayConfig = {
      ...overlayConfig,
      ...(await window.livechatOverlay.getConfig()),
    };

    window.livechatOverlay.onPlay(onPlay);
    window.livechatOverlay.onStop(() => clearOverlay());
    window.livechatOverlay.onSettings((settings) => onSettings(settings));

    window.livechatOverlay.rendererReady();
  };

  bootstrap().catch((error) => {
    console.error('Overlay bootstrap failed:', error);
  });
})();
