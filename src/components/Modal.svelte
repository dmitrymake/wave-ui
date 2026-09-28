<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { modal, closeModal } from "../lib/store";

  let isError = $state(false);
  let inputRef: HTMLInputElement;
  let confirmRef: HTMLButtonElement;
  let prevFocus: HTMLElement | null = null;
  let cardEl: HTMLElement;

  $effect(() => {
    if ($modal.isOpen) {
      prevFocus = document.activeElement as HTMLElement | null;
      // Focus prompt input, confirm button, or (select type) the card itself.
      queueMicrotask(() => {
        if ($modal.type === "prompt" && inputRef) inputRef.focus();
        else if (confirmRef) confirmRef.focus();
        else cardEl?.focus();
      });
    } else if (prevFocus) {
      prevFocus.focus?.();
      prevFocus = null;
    }
  });

  function trapTab(e: KeyboardEvent) {
    if (e.key !== "Tab" || !cardEl) return;
    const focusables = cardEl.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  $effect(() => {
    if (!$modal.isOpen) {
      isError = false;
    }
    // Scroll-lock the background while the dialog is open; restore after.
    // The returned cleanup also covers unmount-with-open (HMR/teardown).
    document.body.style.overflow = $modal.isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  });

  // An async onConfirm keeps the dialog open and disabled until it settles —
  // closing first meant the error toast arrived on the next screen, with no
  // indication of which action had failed.
  let isBusy = $state(false);

  async function runConfirm(value?: string) {
    if (isBusy) return;
    isBusy = true;
    try {
      await $modal.onConfirm?.(value);
      closeModal();
    } finally {
      isBusy = false;
    }
  }

  function handleConfirm() {
    if ($modal.type === "prompt") {
      const val = $modal.inputValue ? $modal.inputValue.trim() : "";

      if (val.length === 0) {
        triggerError();
        return;
      }

      void runConfirm(val);
      return;
    }

    void runConfirm();
  }

  function handleSelect(optionValue: string) {
    void runConfirm(optionValue);
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && $modal.type !== "select") handleConfirm();
    if (isError) isError = false;
  }
</script>

{#if $modal.isOpen}
  <div
    class="backdrop"
    onclick={handleBackdropClick}
    role="presentation"
    transition:fade={{ duration: 150 }}
  >
    <div
      class="modal-card"
      bind:this={cardEl}
      transition:scale={{ start: 0.95, duration: 200 }}
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={$modal.title}
      tabindex="-1"
      onkeydown={(e) => { if (e.key === "Escape") closeModal(); trapTab(e); }}
    >
      <div class="modal-header">
        <span class="modal-title" id="modal-title">{$modal.title}</span>
      </div>

      <div class="modal-body">
        {#if $modal.message}
          <p class="modal-message">{$modal.message}</p>
        {/if}

        {#if $modal.type === "prompt"}
          <div class="input-wrapper">
            <!-- svelte-ignore a11y_autofocus -->
            <input
              bind:this={inputRef}
              type="text"
              class="modal-input"
              class:shake-error={isError}
              placeholder={$modal.placeholder}
              aria-label={$modal.placeholder || $modal.title}
              bind:value={$modal.inputValue}
              onkeydown={handleKeydown}
              autofocus
            />
          </div>
        {:else if $modal.type === "select"}
          <div class="select-list">
            {#each $modal.options as opt}
              <button
                class="select-item"
                class:active={opt.value === $modal.inputValue}
                onclick={() => handleSelect(opt.value)}
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
            <button class="btn cancel" onclick={closeModal} disabled={isBusy}>
              {$modal.cancelLabel}
            </button>
          {/if}
          <button
            class="btn confirm"
            bind:this={confirmRef}
            onclick={handleConfirm}
            disabled={isBusy}
            aria-busy={isBusy}
          >
            {isBusy ? `${$modal.confirmLabel}...` : $modal.confirmLabel}
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
    animation: shake var(--dur-base) ease-in-out;
    border-color: var(--c-error) !important;
    box-shadow: var(--shadow-error-ring);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: var(--c-overlay-dim);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
  }

  .modal-card {
    background: var(--c-bg-card);
    width: 100%;
    max-width: 320px;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    border: var(--border-default);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    height: var(--control-h-2xl);
    background: var(--c-white-10);
    border-bottom: var(--border-default);
    display: flex;
    align-items: center;
    padding: var(--space-0) var(--space-5);
    flex-shrink: 0;
  }

  .modal-title {
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    color: var(--c-text-primary);
  }

  .modal-body {
    padding: var(--space-6) var(--space-5);
    color: var(--c-text-secondary);
  }

  .modal-message {
    margin: var(--space-0);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
    color: var(--c-text-primary);
  }

  .input-wrapper {
    margin-top: var(--space-4);
  }

  .modal-input {
    width: 100%;
    background: var(--c-surface-input);
    border: var(--border-default);
    color: var(--c-text-primary);
    padding: var(--space-3) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    outline: none;
    box-sizing: border-box;
    transition: border-color var(--dur-fast);
  }

  .modal-input:focus {
    border-color: var(--c-focus-line);
  }

  .select-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .select-item {
    background: var(--c-surface-hover);
    border: var(--border-width-thin) solid transparent;
    color: var(--c-text-primary);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    text-align: left;
    font-size: var(--text-base);
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: all var(--trans-fast);
  }

  .select-item:hover {
    background: var(--c-surface-active);
  }

  .select-item.active {
    border-color: var(--c-accent);
    background: var(--c-surface-active);
    color: var(--c-accent-btn);
    font-weight: var(--weight-semibold);
  }

  .check {
    font-weight: var(--weight-bold);
  }

  .modal-actions {
    display: flex;
    border-top: var(--border-default);
  }

  .btn {
    flex: 1;
    background: transparent;
    border: none;
    padding: var(--space-4);
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: background var(--dur-instant);
  }
  .btn:disabled {
    opacity: var(--opacity-muted);
    cursor: default;
  }

  .btn:active {
    background: var(--c-surface-hover);
  }

  .btn.cancel {
    color: var(--c-text-muted);
    border-right: var(--border-default);
  }
  /* Press feedback: the dialog buttons had no :hover and no :active, so a tap
     produced nothing. */
  .btn:active:not(:disabled) {
    background: var(--c-surface-hover);
  }

  .btn.confirm {
    color: var(--c-accent-btn);
  }
</style>
