<script>
  import { fade, scale } from "svelte/transition";
  import { modal, closeModal } from "../lib/store";

  let isError = false;
  let inputRef;

  $: if (!$modal.isOpen) {
    isError = false;
  }

  function handleConfirm() {
    if ($modal.type === "prompt") {
      const val = $modal.inputValue ? $modal.inputValue.trim() : "";

      if (val.length === 0) {
        triggerError();
        return;
      }

      if ($modal.onConfirm) $modal.onConfirm(val);
    } else {
      if ($modal.onConfirm) $modal.onConfirm();
    }

    closeModal();
  }

  function handleSelect(optionValue) {
    if ($modal.onConfirm) $modal.onConfirm(optionValue);
    closeModal();
  }

  function triggerError() {
    isError = true;
    if (inputRef) inputRef.focus();

    setTimeout(() => {
      isError = false;
    }, 400);
  }

  function handleBackdropClick() {
    closeModal();
  }

  function handleKeydown(e) {
    if (e.key === "Enter" && $modal.type !== "select") handleConfirm();
    if (isError) isError = false;
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
        {#if $modal.message}
          <p class="modal-message">{$modal.message}</p>
        {/if}

        {#if $modal.type === "prompt"}
          <div class="input-wrapper">
            <input
              bind:this={inputRef}
              type="text"
              class="modal-input"
              class:shake-error={isError}
              placeholder={$modal.placeholder}
              bind:value={$modal.inputValue}
              on:keydown={handleKeydown}
              autoFocus
            />
          </div>
        {:else if $modal.type === "select"}
          <div class="select-list">
            {#each $modal.options as opt}
              <button
                class="select-item"
                class:active={opt.value === $modal.inputValue}
                on:click={() => handleSelect(opt.value)}
              >
                {opt.label}
                {#if opt.value === $modal.inputValue}
                  <span class="check">✓</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if $modal.type !== "select"}
        <div class="modal-actions">
          {#if $modal.type === "confirm" || $modal.type === "prompt"}
            <button class="btn cancel" on:click={closeModal}>
              {$modal.cancelLabel}
            </button>
          {/if}
          <button class="btn confirm" on:click={handleConfirm}>
            {$modal.confirmLabel}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    20%,
    60% {
      transform: translateX(-5px);
    }
    40%,
    80% {
      transform: translateX(5px);
    }
  }

  .shake-error {
    animation: shake 0.3s ease-in-out;
    border-color: #ff4444 !important;
    box-shadow: 0 0 0 1px rgba(255, 68, 68, 0.3);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: var(--c-black-60);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal-card {
    background: #1e1e1e;
    background: var(--c-bg-card);
    width: 100%;
    max-width: 320px;
    border-radius: 12px;
    box-shadow: 0 10px 40px var(--c-black-70);
    border: 1px solid var(--c-border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    height: 50px;
    background: var(--c-white-10);
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

  .input-wrapper {
    margin-top: 16px;
  }

  .modal-input {
    width: 100%;
    background: var(--c-surface-input);
    border: 1px solid var(--c-border);
    color: var(--c-text-primary);
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  .modal-input:focus {
    border-color: var(--c-accent);
  }

  .select-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }

  .select-item {
    background: var(--c-surface-hover);
    border: 1px solid transparent;
    color: var(--c-text-primary);
    padding: 12px;
    border-radius: 8px;
    text-align: left;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: all 0.2s;
  }

  .select-item:hover {
    background: var(--c-surface-active);
  }

  .select-item.active {
    border-color: var(--c-accent);
    background: var(--c-surface-active);
    color: var(--c-accent);
    font-weight: 600;
  }

  .check {
    font-weight: bold;
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
