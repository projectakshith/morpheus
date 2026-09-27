import { Operator, type OperatorConfig } from "./operator";

export * from "./operator";

export interface ProviderConfig extends OperatorConfig {}

export function resolveOperator(config: ProviderConfig = {}): Operator {
  return new Operator(config);
}
