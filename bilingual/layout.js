// Distances in the source and panel can use different CSS pixels (tab zoom).
// Both views share the bottom edge of the browser's content area.
globalThis.readerLayout = {
  pointerSample: null,
  capture(event) {
    if (!event.isTrusted) return;
    this.pointerSample = {screen: event.screenY, client: event.clientY,
      width: innerWidth, height: innerHeight, windowY: screenY, outer: outerHeight, scale: devicePixelRatio};
  },
  sample() {
    const p = this.pointerSample;
    return p && p.width === innerWidth && p.height === innerHeight && p.windowY === screenY &&
      p.outer === outerHeight && p.scale === devicePixelRatio ? p : null;
  },
  origin(source, ratio) {
    const panel = this.sample();
    if (panel && source.pointer && source.pointer.windowY === panel.windowY) {
      // Chrome reports screenY in desktop logical pixels. Extension pages use
      // the default zoom, while the article may have its own zoom level.
      return source.pointer.screen - source.pointer.client * ratio - (panel.screen - panel.client);
    }
    return innerHeight - source.viewportHeight * ratio;
  },
  firstLine(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const offset = node.data.search(/\S/u);
      if (offset < 0) continue;
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getBoundingClientRect();
      if (rect.height) return rect.top;
    }
    return element.getBoundingClientRect().top;
  },
  corrections(source, target, ratio, origin) {
    let previous = 0;
    return target.map((row, i) => {
      const error = origin + source[i].top * ratio - row.top;
      // Both tops include existing corrections. Subtract the previous
      // residual so one error upstream is not counted again at every row.
      const difference = row.pad - source[i].spacerHeight * ratio + error - previous;
      previous = error;
      return {id: row.id, right: Math.max(0, difference), left: Math.max(0, -difference / ratio)};
    });
  }
};

if (!globalThis.sideTranslatePointerListener) {
  globalThis.sideTranslatePointerListener = event => readerLayout.capture(event);
  addEventListener('pointermove', globalThis.sideTranslatePointerListener, {passive:true});
  addEventListener('pointerdown', globalThis.sideTranslatePointerListener, {passive:true});
}
