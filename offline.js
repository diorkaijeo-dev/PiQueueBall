(function () {
  "use strict";

  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    navigator.serviceWorker.register("service-worker.js").catch((error) => {
      console.error("Offline app files could not be cached.", error);
    });
  }
}());
