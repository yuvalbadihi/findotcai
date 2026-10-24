export function callServerless(webApp, name, input = {}, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The request timed out. Please try again.')),
      timeout,
    );
    try {
      webApp.Serverless.call(name, input, (error, result) => {
        clearTimeout(timer);
        error ? reject(error) : resolve(result);
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

// Telegram for Android appends LOW, AVERAGE or HIGH to its user agent.
export function performanceClass(userAgent = '') {
  return (
    /Telegram-Android\/\S+ \(.*;\s*(LOW|AVERAGE|HIGH)\)/.exec(userAgent)?.[1] ??
    null
  );
}

export function unauthorized(error) {
  return (
    error?.type === 'UNAUTHORIZED' ||
    error?.status === 401 ||
    error?.code === 401 ||
    error?.parameters?.code === 'USER_REQUIRED'
  );
}

// Validates a whole response before it replaces the list on screen.
export function parseDirectory(result) {
  const entries = result?.entries;
  if (!Array.isArray(entries))
    throw new Error('Could not load OTCs. Please try again.');
  const seen = new Set();
  for (const entry of entries) {
    const group = entry?.group;
    if (
      !group ||
      !Number.isSafeInteger(group.id) ||
      group.id >= 0 ||
      typeof group.title !== 'string' ||
      !Number.isSafeInteger(entry.activity?.messagesPerDay) ||
      entry.activity.messagesPerDay < 0 ||
      (entry.rank !== undefined && !Number.isFinite(entry.rank?.score)) ||
      seen.has(group.id)
    )
      throw new Error('Could not load OTCs. Please try again.');
    if (
      group.starsPerMessage !== null &&
      (!Number.isSafeInteger(group.starsPerMessage) ||
        group.starsPerMessage < 0)
    )
      throw new Error('Invalid OTC price. Please try again.');
    if (
      entry.likes &&
      (!Number.isSafeInteger(entry.likes.count) ||
        entry.likes.count < 0 ||
        typeof entry.likes.likedByMe !== 'boolean')
    )
      throw new Error('Could not load likes. Please try again.');
    seen.add(group.id);
  }
  return entries;
}
