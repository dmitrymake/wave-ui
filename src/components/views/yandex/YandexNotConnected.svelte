<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2025 dmitrymake -->
<!--
  The "Not Connected" screen shown when the Yandex token is unset. Self-contained
  presentational shell — extracted verbatim from YandexView so the token gate keeps
  its stable marker text and `.token-alert` styling. Rendered inside the parent's
  `.view-container` so the surrounding layout classes are unchanged.
-->
<div class="token-alert content-padded">
  <h3>Yandex Music Not Connected</h3>
  <p>Please go to Settings and connect your account.</p>
</div>

<style>
  .token-alert {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 50vh;
    text-align: center;
    color: var(--c-text-secondary);
  }
</style>
