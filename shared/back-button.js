class BackButton extends HTMLElement {
	connectedCallback() {
		const href = this.getAttribute("href") || "../index.html";
		this.innerHTML = `<a class="back-button" href="${href}">&larr; Back</a>`;
	}
}

customElements.define("back-button", BackButton);

