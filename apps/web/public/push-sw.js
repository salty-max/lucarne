/* Push handlers, imported into the generated Workbox service worker
   (see vite.config workbox.importScripts). Shows the notification and, on click,
   focuses an open tab (navigating it to the match) or opens a new one. */

self.addEventListener("push", (event) => {
  let data = { title: "Lucarne", body: "" };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data = { title: "Lucarne", body: event.data.text() };
  }
  const title = data.title || "Lucarne";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      renotify: true,
      icon: "/pwa-192.png",
      badge: "/favicon-32.png",
      data: { matchId: data.matchId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const matchId = event.notification.data && event.notification.data.matchId;
  const url = matchId ? "/match/" + matchId : "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (w.url.indexOf(self.location.origin) === 0) {
          await w.focus();
          if ("navigate" in w) {
            try {
              await w.navigate(url);
            } catch (e) {
              /* cross-origin or not allowed — ignore */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
