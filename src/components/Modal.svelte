<script>
  import { fade, scale } from "svelte/transition";
  import { modal, closeModal } from "../lib/store";

  function handleConfirm() {
    if ($modal.onConfirm) {
      $modal.onConfirm();
    }
    closeModal();
  }

  function handleBackdropClick() {
    closeModal();
  }
</script>

{#if $modal.isOpen}
  <div
    class="backdrop"
    on:click={handleBackdropClick}
    transition:fade={{ duration: 150 }}
  >
    <div
      class="modal-card"
      transition:scale={{ start: 0.95, duration: 200 }}
      on:click|stopPropagation
    >
      <div class="modal-header">
        <span class="modal-title">{$modal.title}</span>
      </div>

      <div class="modal-body">
        <p class="modal-message">{$modal.message}</p>
      </div>

      <div class="modal-actions">
        {#if $modal.type === "confirm"}
          <button class="btn cancel" on:click={closeModal}>
            {$modal.cancelLabel}
          </button>
        {/if}
        <button class="btn confirm" on:click={handleConfirm}>
          {$modal.confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: transparent;
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal-card {
    /* Match ContextMenu background */
    background: #1e1e1e;
    width: 100%;
    max-width: 320px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.7);
    border: 1px solid var(--c-border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    height: 50px;
    background: rgba(255, 255, 255, 0.04);
    border-bottom: 1px solid var(--c-border);
    display: flex;
    align-items: center;
    padding: 0 20px;
    flex-shrink: 0;
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--c-text-primary);
  }

  .modal-body {
    padding: 24px 20px;
    color: var(--c-text-secondary);
  }

  .modal-message {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--c-text-primary);
  }

  .modal-actions {
    display: flex;
    border-top: 1px solid var(--c-border);
  }

  .btn {
    flex: 1;
    background: transparent;
    border: none;
    padding: 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.1s;
  }

  .btn:active {
    background: var(--c-surface-hover);
  }

  .btn.cancel {
    color: var(--c-text-muted);
    border-right: 1px solid var(--c-border);
  }

  .btn.confirm {
    color: var(--c-accent);
  }
</style>
