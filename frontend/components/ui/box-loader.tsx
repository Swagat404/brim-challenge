"use client";

import type React from "react";

/**
 * 3D box loader. Animates 4 cubes through a coordinated cycle.
 *
 * Sizing is driven by CSS custom properties on `.boxes`:
 *   --size      cube edge length (default 12px — sized for inline use in chat)
 *   --duration  one full cycle duration (default 1100ms)
 *
 * Override on the wrapping element to adjust per usage site, e.g.:
 *   <div style={{ ['--size' as any]: '20px' }}><BoxLoader /></div>
 *
 * Styles live in `app/globals.css` under the `.boxes` block.
 */
const BoxLoader: React.FC = () => {
  return (
    <div className="boxes">
      <div className="box box-1">
        <div className="face face-front" />
        <div className="face face-right" />
        <div className="face face-top" />
        <div className="face face-back" />
      </div>
      <div className="box box-2">
        <div className="face face-front" />
        <div className="face face-right" />
        <div className="face face-top" />
        <div className="face face-back" />
      </div>
      <div className="box box-3">
        <div className="face face-front" />
        <div className="face face-right" />
        <div className="face face-top" />
        <div className="face face-back" />
      </div>
      <div className="box box-4">
        <div className="face face-front" />
        <div className="face face-right" />
        <div className="face face-top" />
        <div className="face face-back" />
      </div>
    </div>
  );
};

export default BoxLoader;
