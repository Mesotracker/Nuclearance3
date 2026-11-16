// Static asset Worker for the prebuilt Vite SPA (dist/).
// Freebuff Sites serves the uploaded build through env.ASSETS.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
