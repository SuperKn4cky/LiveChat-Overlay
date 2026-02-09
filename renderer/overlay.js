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
    youtubeEmbedOrigin: 'https://com.overlay.client',
    volume: 1,
    showText: true,
  };

  let resetTimer = null;
  let twitterWidgetsPromise = null;

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

  const isYoutubeMediaUrl = (url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
    } catch {
      return false;
    }
  };

  const isTikTokMediaUrl = (url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return host === 'tiktok.com' || host.endsWith('.tiktok.com');
    } catch {
      return false;
    }
  };

  const isLikelyDirectVideoUrl = (url, mimeType) => {
    const normalizedMime = typeof mimeType === 'string' ? mimeType.toLowerCase().trim() : '';

    if (
      normalizedMime &&
      normalizedMime !== 'video/youtube' &&
      normalizedMime !== 'video/tiktok' &&
      (normalizedMime.startsWith('video/') || normalizedMime === 'application/x-mpegurl')
    ) {
      return true;
    }

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();
      const mimeQuery = (parsed.searchParams.get('mime_type') || '').toLowerCase();

      return (
        pathname.endsWith('.mp4') ||
        pathname.endsWith('.m3u8') ||
        pathname.includes('/video/tos/') ||
        pathname.includes('/obj/tos/') ||
        mimeQuery.includes('video_mp4') ||
        mimeQuery.includes('application/x-mpegurl') ||
        ((host === 'tiktok.com' || host.endsWith('.tiktok.com')) &&
          (pathname.includes('/video/tos/') || pathname.includes('/obj/tos/')))
      );
    } catch {
      return false;
    }
  };

  const extractYouTubeVideoId = (url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();

      if (host === 'youtu.be') {
        const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
        return id || null;
      }

      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        if (parsed.pathname === '/watch') {
          return parsed.searchParams.get('v');
        }

        if (parsed.pathname.startsWith('/shorts/')) {
          const id = parsed.pathname.replace('/shorts/', '').split('/')[0];
          return id || null;
        }

        if (parsed.pathname.startsWith('/embed/')) {
          const id = parsed.pathname.replace('/embed/', '').split('/')[0];
          return id || null;
        }
      }

      return null;
    } catch {
      return null;
    }
  };

  const extractTikTokVideoId = (url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (!(host === 'tiktok.com' || host.endsWith('.tiktok.com'))) {
        return null;
      }

      const byQuery =
        parsed.searchParams.get('item_id') ||
        parsed.searchParams.get('video_id') ||
        parsed.searchParams.get('id');
      if (byQuery && /^\d+$/.test(byQuery)) {
        return byQuery;
      }

      const directMatch = parsed.pathname.match(/\/video\/(\d+)/i);
      if (directMatch?.[1]) {
        return directMatch[1];
      }

      const embedMatch = parsed.pathname.match(/\/(?:embed\/v2|player\/v1)\/(\d+)/i);
      if (embedMatch?.[1]) {
        return embedMatch[1];
      }

      return null;
    } catch {
      return null;
    }
  };

  const createYouTubeIframe = (mediaUrl) => {
    const videoId = extractYouTubeVideoId(mediaUrl);
    if (!videoId) {
      return null;
    }

    const embedUrl = new URL(`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`);
    const embedOrigin = (overlayConfig.youtubeEmbedOrigin || '').trim() || 'https://com.overlay.client';
    embedUrl.searchParams.set('autoplay', '1');
    embedUrl.searchParams.set('playsinline', '1');
    embedUrl.searchParams.set('rel', '0');
    embedUrl.searchParams.set('modestbranding', '1');
    embedUrl.searchParams.set('origin', embedOrigin);
    embedUrl.searchParams.set('widget_referrer', embedOrigin);

    const iframe = document.createElement('iframe');
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'origin';
    iframe.src = embedUrl.toString();
    return iframe;
  };

  const createTikTokIframe = (mediaUrl, mimeType) => {
    if (isLikelyDirectVideoUrl(mediaUrl, mimeType)) {
      return null;
    }

    let iframeUrl = null;
    const videoId = extractTikTokVideoId(mediaUrl);

    if (videoId) {
      const embedUrl = new URL(`https://www.tiktok.com/player/v1/${encodeURIComponent(videoId)}`);
      const embedOrigin = (overlayConfig.youtubeEmbedOrigin || '').trim() || 'https://com.overlay.client';
      embedUrl.searchParams.set('autoplay', '1');
      embedUrl.searchParams.set('origin', embedOrigin);
      iframeUrl = embedUrl.toString();
    } else {
      try {
        const parsed = new URL(mediaUrl);
        const host = parsed.hostname.toLowerCase();

        if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
          if (parsed.pathname.startsWith('/embed') || parsed.pathname.startsWith('/player/')) {
            iframeUrl = parsed.toString();
          } else {
            iframeUrl = `https://www.tiktok.com/embed?url=${encodeURIComponent(parsed.toString())}`;
          }
        }
      } catch {
        iframeUrl = null;
      }
    }

    if (!iframeUrl) {
      return null;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'overlay-vertical-media overlay-tiktok-shell';

    const iframe = document.createElement('iframe');
    iframe.className = 'overlay-tiktok-iframe';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'origin';
    iframe.src = iframeUrl;

    const cookieMask = document.createElement('div');
    cookieMask.className = 'overlay-tiktok-cookie-mask';

    wrapper.appendChild(iframe);
    wrapper.appendChild(cookieMask);
    return wrapper;
  };

  const createMediaElement = (kind, mediaUrl, mimeType) => {
    if (kind === 'image') {
      const image = document.createElement('img');
      image.src = mediaUrl;
      return image;
    }

    if (kind === 'video' && isYoutubeMediaUrl(mediaUrl)) {
      const youtubeIframe = createYouTubeIframe(mediaUrl);

      if (youtubeIframe) {
        return youtubeIframe;
      }
    }

    if (kind === 'video' && isTikTokMediaUrl(mediaUrl)) {
      const tiktokIframe = createTikTokIframe(mediaUrl, mimeType);

      if (tiktokIframe) {
        return tiktokIframe;
      }
    }

    if (kind !== 'video') {
      const native = createNativeMediaElement(kind);
      native.src = mediaUrl;
      return native;
    }

    const nativeVideo = createNativeMediaElement(kind);
    nativeVideo.src = mediaUrl;
    return nativeVideo;
  };

  const applyVolume = () => {
    const mediaElements = document.querySelectorAll('#media-layer audio, #media-layer video, #tweet-layer audio, #tweet-layer video');
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

  const renderTweetCard = async (tweetCard, media) => {
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

    if (media?.url && media?.kind) {
      const mediaNode = document.createElement('div');
      mediaNode.className = 'overlay-tweet-media';

      const mediaUrl = buildAuthorizedMediaUrl(media.url);
      const mediaElement = createMediaElement(media.kind, mediaUrl, media.mime);
      mediaNode.appendChild(mediaElement);
      cardNode.appendChild(mediaNode);

      applyVolume();

      if (media.kind !== 'image') {
        try {
          if (typeof mediaElement.play === 'function') {
            await mediaElement.play();
          }
        } catch (error) {
          console.error('Tweet media autoplay failed:', error);
        }

        mediaElement.addEventListener(
          'ended',
          () => {
            clearOverlay();
          },
          { once: true },
        );
      }
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
    const element = createMediaElement(payload.media.kind, mediaUrl, payload.media.mime);
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
        await renderTweetCard(payload.tweetCard, payload.media);
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
