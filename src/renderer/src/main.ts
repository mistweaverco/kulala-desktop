import "@fortawesome/fontawesome-free/css/all.min.css";
import "./app.css";
import "./views/monaco";
import { mount } from "svelte";
import App from "./App.svelte";
import "./overrides.css";

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
