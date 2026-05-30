import type { AbstractHook, Context } from '@hashgraph/hedera-agent-kit';
import type { Client } from '@hiero-ledger/sdk';

/**
 * Run a set of HAK policies/hooks against a tool invocation, at the pre-execution
 * stage, before any side effects.
 *
 * Our tools are functional `Tool` objects rather than `BaseTool` subclasses, so the
 * kit's automatic `context.hooks` execution (which only fires inside BaseTool's
 * lifecycle) never runs for them. This helper bridges that gap: it invokes each
 * policy's public `preToolExecutionHook`, which throws if the policy blocks the call.
 *
 * Policies self-filter by `relevantTools`, so passing the full set is safe; each one
 * ignores methods it does not target.
 */
export async function enforcePreToolPolicies(
  policies: AbstractHook[],
  method: string,
  rawParams: unknown,
  context: Context,
  client: Client,
): Promise<void> {
  for (const policy of policies) {
    await policy.preToolExecutionHook({ context, rawParams, client }, method);
  }
}
