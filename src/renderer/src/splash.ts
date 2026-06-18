import icon from "./../../../logo.svg?raw";
const symbols = {
  "%": "%25",
  "<": "%3C",
  ">": "%3E",
  " ": "%20",
  "!": "%21",
  "*": "%2A",
  "'": "%27",
  '"': "%22",
  "(": "%28",
  ")": "%29",
  ";": "%3B",
  ":": "%3A",
  "@": "%40",
  "&": "%26",
  "=": "%3D",
  "+": "%2B",
  $: "%24",
  ",": "%2C",
  "/": "%2F",
  "?": "%3F",
  "#": "%23",
  "[": "%5B",
  "]": "%5D",
};

function url_encode(string: string): string {
  for (const s in symbols) {
    string = string.replace(new RegExp("[" + s + "]", "g"), symbols[s]);
  }
  return `data:image/svg+xml,${string}`;
}
const iconBase64 = url_encode(icon);

document.getElementById("icon").setAttribute("src", iconBase64);
