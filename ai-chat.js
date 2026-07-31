// JANVI AIKA Dashboard - AI Chatbot Assistant Engine (OpenRouter with Auto-Fallback & Authentication)

(function () {
    'use strict';

    const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Free models ordered by primary priority -> fallback (Max 3 for OpenRouter 'models' array)
    const FREE_MODELS = [
        "google/gemma-4-31b-it:free",
        "google/gemma-4-26b-a4b-it:free",
        "openai/gpt-oss-20b:free"
    ];



    class AIChatAssistant {
        constructor() {
            this.apiKey = localStorage.getItem('janvi_ai_openrouter_key') || window.OPENROUTER_API_KEY || '';
            this.activeModel = localStorage.getItem('janvi_ai_model') || FREE_MODELS[0];


            
            // Authentication state
            this.authUsername = (localStorage.getItem('janvi_ai_auth_user') || 'admin').toLowerCase();
            this.authPassword = localStorage.getItem('janvi_ai_auth_pass') || 'aika2026';
            this.isAuthenticated = sessionStorage.getItem('janvi_ai_authenticated') === 'true';

            this.history = [];
            this.isOpen = false;
            this.isGenerating = false;

            this.initElements();
            this.initListeners();
            this.updateKeyBadge();
        }

        initElements() {
            this.elements = {
                toggleBtn: document.getElementById('ai-chat-toggle-btn'),
                chatDrawer: document.getElementById('ai-chat-drawer'),
                closeBtn: document.getElementById('ai-chat-close-btn'),
                logoutBtn: document.getElementById('ai-logout-btn'),
                settingsBtn: document.getElementById('ai-settings-btn'),
                settingsModal: document.getElementById('ai-settings-modal'),
                closeSettingsBtn: document.getElementById('ai-settings-close-btn'),
                saveSettingsBtn: document.getElementById('ai-save-settings-btn'),
                apiKeyInput: document.getElementById('ai-api-key-input'),
                modelSelect: document.getElementById('ai-model-select'),
                changePassInput: document.getElementById('ai-change-pass'),
                messagesContainer: document.getElementById('ai-chat-messages'),
                inputForm: document.getElementById('ai-chat-form'),
                userInput: document.getElementById('ai-chat-input'),
                sendBtn: document.getElementById('ai-chat-send-btn'),
                clearBtn: document.getElementById('ai-clear-chat-btn'),
                pillButtons: document.querySelectorAll('.ai-pill-btn'),
                activeModelBadge: document.getElementById('ai-active-model-badge'),
                keyStatusBadge: document.getElementById('ai-key-status-badge'),

                // Auth Elements
                loginModal: document.getElementById('ai-login-modal'),
                loginCloseBtn: document.getElementById('ai-login-close-btn'),
                loginForm: document.getElementById('ai-login-form'),
                loginUser: document.getElementById('ai-login-user'),
                loginPass: document.getElementById('ai-login-pass'),
                loginError: document.getElementById('ai-login-error')
            };

            // Populate model select options
            if (this.elements.modelSelect) {
                this.elements.modelSelect.innerHTML = FREE_MODELS.map(m => 
                    `<option value="${m}" ${m === this.activeModel ? 'selected' : ''}>${m.replace(':free', ' (Free)')}</option>`
                ).join('') + `<option value="auto">⚡ Auto Fallback Queue (Recommended)</option>`;
            }
        }

        initListeners() {
            if (!this.elements.toggleBtn) return;

            this.elements.toggleBtn.addEventListener('click', () => {
                if (!this.isAuthenticated) {
                    this.showLoginModal(true);
                } else {
                    this.toggleDrawer();
                }
            });

            if (this.elements.closeBtn) this.elements.closeBtn.addEventListener('click', () => this.toggleDrawer(false));
            
            if (this.elements.logoutBtn) {
                this.elements.logoutBtn.addEventListener('click', () => this.handleLogout());
            }

            // Auth Modal Listeners
            if (this.elements.loginCloseBtn) {
                this.elements.loginCloseBtn.addEventListener('click', () => this.showLoginModal(false));
            }

            if (this.elements.loginForm) {
                this.elements.loginForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handleLogin();
                });
            }

            if (this.elements.settingsBtn) {
                this.elements.settingsBtn.addEventListener('click', () => {
                    this.elements.apiKeyInput.value = this.apiKey;
                    this.elements.settingsModal.classList.add('active');
                });
            }

            if (this.elements.closeSettingsBtn) {
                this.elements.closeSettingsBtn.addEventListener('click', () => {
                    this.elements.settingsModal.classList.remove('active');
                });
            }

            if (this.elements.saveSettingsBtn) {
                this.elements.saveSettingsBtn.addEventListener('click', () => {
                    this.apiKey = this.elements.apiKeyInput.value.trim();
                    this.activeModel = this.elements.modelSelect.value;
                    localStorage.setItem('janvi_ai_openrouter_key', this.apiKey);
                    localStorage.setItem('janvi_ai_model', this.activeModel);

                    const newPass = this.elements.changePassInput?.value.trim();
                    if (newPass) {
                        this.authPassword = newPass;
                        localStorage.setItem('janvi_ai_auth_pass', newPass);
                        this.elements.changePassInput.value = '';
                        this.addSystemMessage("🔑 Access Password updated successfully!");
                    }

                    this.updateKeyBadge();
                    this.elements.settingsModal.classList.remove('active');
                    this.addSystemMessage("✅ AI Settings updated successfully!");
                });
            }

            if (this.elements.inputForm) {
                this.elements.inputForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handleUserSubmit();
                });
            }

            if (this.elements.clearBtn) {
                this.elements.clearBtn.addEventListener('click', () => {
                    this.history = [];
                    this.elements.messagesContainer.innerHTML = '';
                    this.addWelcomeMessage();
                });
            }

            if (this.elements.pillButtons) {
                this.elements.pillButtons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const prompt = btn.getAttribute('data-prompt');
                        if (prompt) {
                            if (!this.isAuthenticated) {
                                this.showLoginModal(true);
                                return;
                            }
                            if (!this.isOpen) this.toggleDrawer(true);
                            this.elements.userInput.value = prompt;
                            this.handleUserSubmit();
                        }
                    });
                });
            }
        }

        showLoginModal(show) {
            if (!this.elements.loginModal) return;
            if (show) {
                this.elements.loginError.style.display = 'none';
                this.elements.loginUser.value = '';
                this.elements.loginPass.value = '';
                this.elements.loginModal.classList.add('active');
                setTimeout(() => this.elements.loginUser.focus(), 100);
            } else {
                this.elements.loginModal.classList.remove('active');
            }
        }

        handleLogin() {
            const user = (this.elements.loginUser.value || '').trim().toLowerCase();
            const pass = (this.elements.loginPass.value || '').trim();

            if (user === this.authUsername && pass === this.authPassword) {
                this.isAuthenticated = true;
                sessionStorage.setItem('janvi_ai_authenticated', 'true');
                this.showLoginModal(false);
                this.updateKeyBadge();
                this.toggleDrawer(true);
            } else {
                this.elements.loginError.textContent = '❌ Invalid Username or Password. Access Denied.';
                this.elements.loginError.style.display = 'block';
                this.elements.loginPass.value = '';
                this.elements.loginPass.focus();
            }
        }

        handleLogout() {
            this.isAuthenticated = false;
            sessionStorage.removeItem('janvi_ai_authenticated');
            this.toggleDrawer(false);
            this.updateKeyBadge();
        }

        toggleDrawer(forceState) {
            if (!this.isAuthenticated && forceState !== false) {
                this.showLoginModal(true);
                return;
            }

            this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
            if (this.isOpen) {
                this.elements.chatDrawer.classList.add('active');
                this.elements.toggleBtn.classList.add('open');
                this.elements.userInput.focus();
                if (this.history.length === 0) {
                    this.addWelcomeMessage();
                }
            } else {
                this.elements.chatDrawer.classList.remove('active');
                this.elements.toggleBtn.classList.remove('open');
            }
        }

        updateKeyBadge() {
            if (this.elements.activeModelBadge) {
                const displayModel = this.activeModel === 'auto' ? 'Auto-Fallback Free' : this.activeModel.split('/')[1] || this.activeModel;
                this.elements.activeModelBadge.textContent = displayModel.replace(':free', '');
            }
            if (this.elements.keyStatusBadge) {
                if (!this.isAuthenticated) {
                    this.elements.keyStatusBadge.textContent = '🔒 Locked';
                    this.elements.keyStatusBadge.className = 'ai-badge warning';
                } else if (this.apiKey) {
                    this.elements.keyStatusBadge.textContent = 'Ready';
                    this.elements.keyStatusBadge.className = 'ai-badge ready';
                } else {
                    this.elements.keyStatusBadge.textContent = 'Set Key ⚙️';
                    this.elements.keyStatusBadge.className = 'ai-badge warning';
                }
            }
        }

        addWelcomeMessage() {
            const welcomeText = `👋 Hello! I am your **JANVI AIKA Dashboard Assistant**.

I analyze real-time website orders, financial performance, and delivery metrics. Ask me anything or try one of these quick prompts:
- 📊 *"Summarize current performance & revenue"*
- 🚚 *"What is our delivery vs return breakdown?"*
- 🗺️ *"Top performing states by revenue"*
- ⚠️ *"Analyze cancellation & return risks"*`;

            this.appendMessage('assistant', welcomeText);
        }

        addSystemMessage(text) {
            this.appendMessage('system', text);
        }

        // Classify order into exact dashboard pipeline stage
        getPipelineStage(o) {
            const status = (o.logisticsStatus || o.fulfillmentStatus || o.status || '').toString().toUpperCase().trim();
            const isReturned = o.returned === true || String(o.returned).toLowerCase() === 'true';
            
            if (status.includes('CANCELED') || status.includes('CANCELLED')) {
                return 'canceled';
            } else if (status.includes('RTO')) {
                return 'denied';
            } else if (isReturned && (status === 'DELIVERED' || status === 'SELF FULFILED' || status === 'FULFILLED' || status === 'NEW ORDER')) {
                return 'returned';
            } else if (status === 'DELIVERED' || status === 'SELF FULFILED') {
                return 'delivered';
            } else if (status.includes('TRANSIT') || status.includes('PICKED UP') || status.includes('DELIVERY') || status.includes('HUB') || status.includes('SHIPPED') || status.includes('UNDELIVERED')) {
                return 'transit';
            } else if (status.includes('PICKUP') || status.includes('READY TO SHIP')) {
                return 'pickup';
            } else {
                return 'unfulfilled';
            }
        }

        // Extracts live summarized context from Active Orders Master Table and window.state
        getDashboardContext() {
            const masterOrders = (window.state && Array.isArray(window.state.orders)) ? window.state.orders : [];
            const filteredOrders = (window.state && Array.isArray(window.state.filteredOrders)) ? window.state.filteredOrders : masterOrders;

            // Fallback to raw sheet data if app state not parsed yet
            let sourceOrders = filteredOrders;
            if (sourceOrders.length === 0 && window.DASHBOARD_DATA && window.DASHBOARD_DATA.sheets && window.DASHBOARD_DATA.sheets["Master Sheet"]) {
                const rows = window.DASHBOARD_DATA.sheets["Master Sheet"];
                if (rows.length > 1) {
                    sourceOrders = rows.slice(1).map(r => ({
                        orderNo: r[0],
                        customerName: r[1],
                        itemsOrdered: r[2],
                        dateOfOrder: r[3],
                        totalPrice: parseFloat(r[4] || 0),
                        paymentMethod: r[5],
                        returned: String(r[8]).toLowerCase() === 'true' || r[8] === true,
                        city: r[11],
                        fulfillmentStatus: r[13],
                        logisticsStatus: r[13],
                        sku: r[18] || '-',
                        category: r[19] || '-'
                    }));
                }
            }

            const totalMasterCount = masterOrders.length || sourceOrders.length;
            const activeTableCount = sourceOrders.length;

            let totalRevenue = 0;
            let pipelineCounts = {
                delivered: 0,
                returned: 0,
                denied: 0,
                canceled: 0,
                transit: 0,
                pickup: 0,
                unfulfilled: 0
            };

            sourceOrders.forEach(o => {
                const rev = parseFloat(o.totalPrice || o.amount || o.Total || 0);
                totalRevenue += rev;

                const stage = this.getPipelineStage(o);
                pipelineCounts[stage] = (pipelineCounts[stage] || 0) + 1;
            });

            // Active Filters in Master Table UI
            const searchQuery = document.getElementById('search-input')?.value.trim() || 'None';
            const monthFilter = document.getElementById('top-filter-month')?.value || document.getElementById('filter-month')?.value || 'All Months';
            const paymentFilter = document.getElementById('filter-payment')?.value || 'All Payment Methods';
            const categoryFilter = document.getElementById('filter-category')?.value || 'All Categories';
            const statusFilter = document.getElementById('filter-status')?.value || 'All Statuses';

            // Sample active matching orders from the table for detailed answers
            const sampleOrders = sourceOrders.slice(0, 10).map(o => 
                `• Order ${o.orderNo} | ${o.customerName} | ₹${o.totalPrice} | Date: ${o.dateOfOrder} | Payment: ${o.paymentMethod} | Stage: ${this.getPipelineStage(o).toUpperCase()} (${o.logisticsStatus || o.fulfillmentStatus}) | City: ${o.city} | Items: ${o.itemsOrdered}`
            ).join('\n');

            const delPct = activeTableCount ? ((pipelineCounts.delivered / activeTableCount) * 100).toFixed(1) : 0;
            const retPct = activeTableCount ? ((pipelineCounts.returned / activeTableCount) * 100).toFixed(1) : 0;
            const rtoPct = activeTableCount ? ((pipelineCounts.denied / activeTableCount) * 100).toFixed(1) : 0;
            const canPct = activeTableCount ? ((pipelineCounts.canceled / activeTableCount) * 100).toFixed(1) : 0;
            const traPct = activeTableCount ? ((pipelineCounts.transit / activeTableCount) * 100).toFixed(1) : 0;
            const unfPct = activeTableCount ? (((pipelineCounts.unfulfilled + pipelineCounts.pickup) / activeTableCount) * 100).toFixed(1) : 0;

            return `
=== ACTIVE ORDERS MASTER TABLE & PIPELINE CONTEXT ===
Total Master Dataset Orders: ${totalMasterCount}
Active Matching Orders in View: ${activeTableCount}
Active Table Filters: Search="${searchQuery}", Month="${monthFilter}", Payment="${paymentFilter}", Category="${categoryFilter}", Status="${statusFilter}"
Filtered View Total Revenue: ₹${Math.round(totalRevenue).toLocaleString('en-IN')}

Exact Pipeline Metrics Breakdown:
- Delivered Orders (Successful): ${pipelineCounts.delivered} (${delPct}%)
- In Transit / Shipped / Hub: ${pipelineCounts.transit} (${traPct}%)
- Returned Orders: ${pipelineCounts.returned} (${retPct}%)
- RTO / Denied Orders: ${pipelineCounts.denied} (${rtoPct}%)
- Canceled Orders: ${pipelineCounts.canceled} (${canPct}%)
- New / Unfulfilled / Pending: ${pipelineCounts.unfulfilled + pipelineCounts.pickup} (${unfPct}%)

Sample Matching Orders in Active Master Table:
${sampleOrders || 'No matching orders in active view.'}
=====================================================
`;
        }




        async handleUserSubmit() {
            if (!this.isAuthenticated) {
                this.showLoginModal(true);
                return;
            }

            if (this.isGenerating) return;

            const text = this.elements.userInput.value.trim();
            if (!text) return;

            if (!this.apiKey) {
                this.appendMessage('user', text);
                this.elements.userInput.value = '';
                this.appendMessage('assistant', `⚠️ **API Key Required**: Please click the **⚙️ Settings** icon at the top right of this chat window and enter your **OpenRouter API Key** (or get a free key at [openrouter.ai](https://openrouter.ai/keys)).`);
                return;
            }

            this.appendMessage('user', text);
            this.history.push({ role: 'user', content: text });
            this.elements.userInput.value = '';
            this.isGenerating = true;

            const loaderEl = this.appendLoadingIndicator();

            try {
                const responseText = await this.callOpenRouterWithFallback(text);
                loaderEl.remove();
                this.appendMessage('assistant', responseText);
                this.history.push({ role: 'assistant', content: responseText });
            } catch (err) {
                loaderEl.remove();
                this.appendMessage('assistant', `❌ **API Error**: ${err.message || 'Failed to connect to OpenRouter.'}\n\nPlease verify your API key in **⚙️ Settings** or check your connection.`);
            } finally {
                this.isGenerating = false;
            }
        }

        async callOpenRouterWithFallback(userPrompt) {
            const contextText = this.getDashboardContext();
            const systemPrompt = `You are the expert AI Analytics Assistant for JANVI AIKA, a premium clothing & e-commerce brand.
Your job is to answer user questions, summarize live order statistics, explain trends, and offer actionable insights based strictly on the provided Live Dashboard Context.
Keep your answers professional, concise, clearly formatted with markdown bolding and bullet points, and use Indian Rupee (₹) formatting for currency.

${contextText}`;

            const messagesPayload = [
                { role: 'system', content: systemPrompt },
                ...this.history.slice(-6) // Keep last 3 conversation turns for context
            ];

            // Determine models queue
            let modelQueue = [];
            if (this.activeModel === 'auto') {
                modelQueue = [...FREE_MODELS];
            } else {
                modelQueue = [this.activeModel, ...FREE_MODELS.filter(m => m !== this.activeModel)];
            }

            let lastError = null;

            for (let i = 0; i < modelQueue.length; i++) {
                const currentModel = modelQueue[i];
                try {
                    const response = await fetch(OPENROUTER_ENDPOINT, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'HTTP-Referer': window.location.href || 'https://janvi-aika-dashboard.vercel.app',
                            'X-Title': 'JANVI AIKA Dashboard Assistant',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: currentModel,
                            models: modelQueue.slice(0, 3), // OpenRouter limit: max 3 items
                            messages: messagesPayload,
                            temperature: 0.4,
                            max_tokens: 1000
                        })

                    });

                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        const status = response.status;
                        
                        if (status === 401) {
                            throw new Error('Invalid OpenRouter API Key. Please update key in Settings.');
                        }
                        
                        throw new Error(`Model ${currentModel} returned ${status}: ${errData.error?.message || response.statusText}`);
                    }

                    const data = await response.json();
                    const choice = data.choices && data.choices[0];
                    if (choice && choice.message && choice.message.content) {
                        const usedModel = data.model || currentModel;
                        if (this.elements.activeModelBadge) {
                            this.elements.activeModelBadge.textContent = usedModel.split('/')[1]?.replace(':free', '') || usedModel;
                        }
                        return choice.message.content;
                    }
                } catch (err) {
                    console.warn(`Model ${currentModel} failed:`, err.message);
                    lastError = err;
                    if (err.message.includes('Invalid OpenRouter API Key')) {
                        throw err;
                    }
                }
            }

            throw lastError || new Error('All free AI models were temporarily busy or unavailable. Please try again in a few seconds.');
        }

        appendMessage(role, content) {
            const container = this.elements.messagesContainer;
            if (!container) return;

            const msgDiv = document.createElement('div');
            msgDiv.className = `ai-message ai-message-${role}`;

            const formattedContent = this.formatMarkdown(content);

            msgDiv.innerHTML = `
                <div class="ai-avatar">${role === 'user' ? '👤' : (role === 'system' ? '⚙️' : '✨')}</div>
                <div class="ai-bubble">${formattedContent}</div>
            `;

            container.appendChild(msgDiv);
            container.scrollTop = container.scrollHeight;
            return msgDiv;
        }

        appendLoadingIndicator() {
            const container = this.elements.messagesContainer;
            const loaderDiv = document.createElement('div');
            loaderDiv.className = 'ai-message ai-message-assistant ai-loading';
            loaderDiv.innerHTML = `
                <div class="ai-avatar">✨</div>
                <div class="ai-bubble">
                    <div class="ai-typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <span class="ai-loading-text">Analyzing dashboard metrics...</span>
                </div>
            `;
            container.appendChild(loaderDiv);
            container.scrollTop = container.scrollHeight;
            return loaderDiv;
        }

        formatMarkdown(text) {
            if (!text) return '';
            let html = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

            const lines = html.split('\n');
            let result = '';
            let inList = false;

            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    if (!inList) {
                        result += '<ul>';
                        inList = true;
                    }
                    result += `<li>${trimmed.substring(2)}</li>`;
                } else {
                    if (inList) {
                        result += '</ul>';
                        inList = false;
                    }
                    if (trimmed.length > 0) {
                        result += `<p>${line}</p>`;
                    }
                }
            });

            if (inList) result += '</ul>';
            return result;
        }
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.aiChatAssistant = new AIChatAssistant());
    } else {
        window.aiChatAssistant = new AIChatAssistant();
    }
})();
