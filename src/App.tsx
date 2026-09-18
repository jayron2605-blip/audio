/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PhoneCallUI } from "./components/PhoneCallUI";

export default function App() {
  return (
    <div className="bg-black w-full h-screen font-sans antialiased overflow-hidden selection:bg-emerald-500/30">
      <PhoneCallUI />
    </div>
  );
}
