import type { Meta, StoryObj } from "@storybook/react-vite";
import { ESTADOS, StatusChip, type Estado } from "./StatusChip.js";

const meta = {
  title: "Chamados/StatusChip",
  component: StatusChip,
} satisfies Meta<typeof StatusChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Novo: Story = { args: { estado: "novo" } };
export const EmAtendimento: Story = { args: { estado: "em-atendimento" } };
export const SlaViolado: Story = { args: { estado: "sla-violado" } };
export const Fechado: Story = { args: { estado: "fechado" } };

/**
 * Todos os estados juntos. É a história que revela regressão de contraste em um
 * estado isolado — que passaria despercebida se cada um só existisse em sua própria
 * página.
 */
export const TodosOsEstados: Story = {
  args: { estado: "novo" },
  render: () => (
    <div className="flex flex-wrap gap-2 bg-surface p-4">
      {Object.keys(ESTADOS).map((estado) => (
        <StatusChip key={estado} estado={estado as Estado} />
      ))}
    </div>
  ),
};
