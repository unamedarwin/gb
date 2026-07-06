import { boot } from "./js/main.js";

document.documentElement.dataset.appReady = "loading";

boot()
  .then(() => {
    document.documentElement.dataset.appReady = "ready";
  })
  .catch((error) => {
    document.documentElement.dataset.appReady = "error";
    console.error(error);
  });
