import { PhoneShell } from "./phone/PhoneShell";
import { ActivationGate } from "./phone/ActivationGate";

export default function App() {
  return (
    <ActivationGate>
      <PhoneShell />
    </ActivationGate>
  );
}
