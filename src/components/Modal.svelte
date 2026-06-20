<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { modal, closeModal } from "../lib/store";

  let isError = $state(false);
  let inputRef: HTMLInputElement;

  $effect(() => {
    if (!$modal.isOpen) {
      isError = false;
    }
  });

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

  function handleSelect(optionValue: string) {
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
      transition:scale={{ start: 0.95, duration: 200 }}
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      onkeydown={(e) => { if (e.key === "Escape") closeModal(); }}
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
            <!-- svelte-ignore a11y_autofocus -->
            <input
              bind:this={inputRef}
              type="text"
              class="modal-input"
              class:shake-error={isError}
              placeholder={$modal.placeholder}
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
            <button class="btn cancel" onclick={closeModal}>
              {$modal.cancelLabel}
            </button>
          {/if}
          <button class="btn confirm" onclick={handleConfirm}>
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
    border-color: var(--c-accent);
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
    color: var(--c-accent);
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

  .btn:active {
    background: var(--c-surface-hover);
  }

  .btn.cancel {
    color: var(--c-text-muted);
    border-right: var(--border-default);
  }

  .btn.confirm {
    color: var(--c-accent);
  }
</style>
