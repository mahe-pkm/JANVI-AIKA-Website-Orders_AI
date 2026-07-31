// JANVI AIKA Dashboard - AI Chatbot Assistant Engine (OpenRouter with Auto-Fallback & Authentication)

(function () {
    'use strict';

    const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Expanded Free models queue ordered by primary priority -> fallback (Max 3 per REST request payload)
    const FREE_MODELS = [
        "google/gemma-4-31b-it:free",
        "google/gemma-4-26b-a4b-it:free",
        "openai/gpt-oss-20b:free",
        "inclusionai/ling-3.0-flash:free",
        "cohere/north-mini-code:free",
        "nvidia/nemotron-3-nano-30b-a3b:free"
    ];

    class AIChatAssistant {
        constructor() {
            this.apiKey = localStorage.getItem('janvi_ai_openrouter_key') || window.OPENROUTER_API_KEY || (typeof atob === 'function' ? atob('c2stb3ItdjEtNjY2MTY3NTFlYzJhYjM0NWE2ZDg2ZDY5NzE0Njc5ODRlZTc2Yjc0NTNjYTllNzMxMmE5NjRkNmRkM3MyNzBmMw==') : '');
            this.activeModel = FREE_MODELS[0];

            // Authentication state
            this.authUsername = (localStorage.getItem('janvi_ai_auth_user') || 'admin').toLowerCase();
            this.authPassword = localStorage.getItem('janvi_ai_auth_pass') || 'aika2026';
            this.isAuthenticated = sessionStorage.getItem('janvi_ai_authenticated') === 'true';

            this.history = [];
            this.isOpen = false;
            this.isMaximized = false;
            this.isDocked = localStorage.getItem('janvi_ai_docked') === 'true';
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
                dockBtn: document.getElementById('ai-dock-btn'),
                maximizeBtn: document.getElementById('ai-maximize-btn'),
                logoutBtn: document.getElementById('ai-logout-btn'),
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
            
            if (this.elements.dockBtn) {
                this.elements.dockBtn.addEventListener('click', () => this.toggleDock());
            }

            if (this.elements.maximizeBtn) {
                this.elements.maximizeBtn.addEventListener('click', () => this.toggleMaximize());
            }

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

        toggleDock(forceState) {
            this.isDocked = forceState !== undefined ? forceState : !this.isDocked;
            localStorage.setItem('janvi_ai_docked', this.isDocked ? 'true' : 'false');

            if (this.isDocked) {
                if (this.isMaximized) this.toggleMaximize(false);
                this.elements.chatDrawer.classList.add('docked-sidebar');
                document.body.classList.add('ai-sidebar-docked');
                if (this.elements.dockBtn) {
                    this.elements.dockBtn.textContent = '💬';
                    this.elements.dockBtn.title = 'Floating Overlay Mode';
                }
            } else {
                this.elements.chatDrawer.classList.remove('docked-sidebar');
                document.body.classList.remove('ai-sidebar-docked');
                if (this.elements.dockBtn) {
                    this.elements.dockBtn.textContent = '📌';
                    this.elements.dockBtn.title = 'Dock Sidebar Mode';
                }
            }

            // Trigger window resize so Chart.js charts and master table re-layout cleanly
            setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
        }

        toggleMaximize(forceState) {
            this.isMaximized = forceState !== undefined ? forceState : !this.isMaximized;
            if (this.isMaximized) {
                if (this.isDocked) {
                    this.elements.chatDrawer.classList.remove('docked-sidebar');
                    document.body.classList.remove('ai-sidebar-docked');
                }
                this.elements.chatDrawer.classList.add('maximized');
                if (this.elements.maximizeBtn) {
                    this.elements.maximizeBtn.textContent = '🗗';
                    this.elements.maximizeBtn.title = 'Restore Window';
                }
            } else {
                this.elements.chatDrawer.classList.remove('maximized');
                if (this.isDocked) {
                    this.elements.chatDrawer.classList.add('docked-sidebar');
                    document.body.classList.add('ai-sidebar-docked');
                }
                if (this.elements.maximizeBtn) {
                    this.elements.maximizeBtn.textContent = '🗖';
                    this.elements.maximizeBtn.title = 'Maximize Window';
                }
            }
            setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
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
            if (this.isMaximized) this.toggleMaximize(false);
            if (this.isDocked) document.body.classList.remove('ai-sidebar-docked');
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
                
                if (this.isDocked && window.innerWidth >= 1024) {
                    this.toggleDock(true);
                }

                if (this.history.length === 0) {
                    this.addWelcomeMessage();
                }
            } else {
                this.elements.chatDrawer.classList.remove('active');
                this.elements.toggleBtn.classList.remove('open');
                if (this.isMaximized) this.toggleMaximize(false);
                document.body.classList.remove('ai-sidebar-docked');
            }
            setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
        }

        updateKeyBadge() {
            if (this.elements.activeModelBadge) {
                const displayModel = this.activeModel.split('/')[1]?.replace(':free', '') || this.activeModel;
                this.elements.activeModelBadge.textContent = displayModel;
            }
            if (this.elements.keyStatusBadge) {
                if (!this.isAuthenticated) {
                    this.elements.keyStatusBadge.textContent = '🔒 Locked';
                    this.elements.keyStatusBadge.className = 'ai-badge warning';
                } else {
                    this.elements.keyStatusBadge.textContent = 'Ready';
                    this.elements.keyStatusBadge.className = 'ai-badge ready';
                }
            }
        }

        addWelcomeMessage() {
            const welcomeText = `👋 Hello! I am your **Janvi AI Assistance**.

I analyze real-time website orders, financial performance, and delivery metrics. Ask me anything or try one of these quick prompts:
- 📊 *"Summarize current performance & revenue"*
- 🚚 *"What is our delivery vs return breakdown in a table?"*
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
        getDashboardContext(userQuery = '') {
            const masterOrders = (window.state && Array.isArray(window.state.orders)) ? window.state.orders : [];
            const filteredOrders = (window.state && Array.isArray(window.state.filteredOrders)) ? window.state.filteredOrders : masterOrders;

            // Fallback to raw sheet data if app state not parsed yet
            let sourceOrders = filteredOrders.length > 0 ? filteredOrders : masterOrders;
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

            // Smart Exact Match Extractor for user query (Customer Name, Order #, City, Product, etc.)
            let exactMatches = [];
            const q = (userQuery || '').trim().toLowerCase();
            
            if (q) {
                // Extract search terms (ignore generic words)
                const terms = q.replace(/[^a-zA-Z0-9\s#]/g, '')
                               .split(/\s+/)
                               .filter(t => t.length >= 2 && !['get', 'me', 'the', 'order', 'details', 'of', 'for', 'show', 'what', 'is', 'where', 'status', 'find'].includes(t));

                exactMatches = sourceOrders.filter(o => {
                    const orderIdStr = String(o.orderNo || o.order_id || '').toLowerCase();
                    const custNameStr = String(o.customerName || o.customer || '').toLowerCase();
                    const cityStr = String(o.city || '').toLowerCase();
                    const itemStr = String(o.itemsOrdered || o.items || '').toLowerCase();
                    const skuStr = String(o.sku || '').toLowerCase();
                    const catStr = String(o.category || '').toLowerCase();

                    // Check exact or partial term match
                    return terms.some(t => {
                        const cleanT = t.replace('#', '');
                        return orderIdStr.includes(cleanT) ||
                               custNameStr.includes(t) ||
                               cityStr.includes(t) ||
                               itemStr.includes(t) ||
                               skuStr.includes(t) ||
                               catStr.includes(t);
                    });
                });
            }

            let exactMatchSection = '';
            if (exactMatches.length > 0) {
                const matchRows = exactMatches.slice(0, 15).map(o => 
                    `• ORDER #${o.orderNo} | Customer Name: "${o.customerName}" | Date: ${o.dateOfOrder} | Price: ₹${o.totalPrice} | Payment: ${o.paymentMethod} | Logistics Status: ${o.logisticsStatus || o.fulfillmentStatus || 'UNKNOWN'} | Stage: ${this.getPipelineStage(o).toUpperCase()} | City: ${o.city} | PIN: ${o.pincode || o.pin || '-'} | Items: ${o.itemsOrdered} | SKU: ${o.sku || '-'} | Category: ${o.category || '-'} | Returned: ${o.returned ? 'Yes' : 'No'}`
                ).join('\n');
                exactMatchSection = `
🎯 EXACT HIGH-PRIORITY SEARCH MATCHES FOUND FOR USER QUERY ("${userQuery}"):
${matchRows}
`;
            }

            // Compact Index of ALL 173 Orders in Master Dataset
            const allOrdersCompactIndex = sourceOrders.map(o => 
                `• #${o.orderNo} | ${o.customerName} | ₹${o.totalPrice} | ${o.dateOfOrder} | ${o.paymentMethod} | ${this.getPipelineStage(o).toUpperCase()} (${o.logisticsStatus || o.fulfillmentStatus}) | ${o.city} | ${o.itemsOrdered}`
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
Filtered View Total Revenue: ₹${Math.round(totalRevenue).toLocaleString('en-IN')}

Exact Pipeline Metrics Breakdown:
- Delivered Orders (Successful): ${pipelineCounts.delivered} (${delPct}%)
- In Transit / Shipped / Hub: ${pipelineCounts.transit} (${traPct}%)
- Returned Orders: ${pipelineCounts.returned} (${retPct}%)
- RTO / Denied Orders: ${pipelineCounts.denied} (${rtoPct}%)
- Canceled Orders: ${pipelineCounts.canceled} (${canPct}%)
- New / Unfulfilled / Pending: ${pipelineCounts.unfulfilled + pipelineCounts.pickup} (${unfPct}%)
${exactMatchSection}
=== COMPLETE MASTER DATASET COMPACT INDEX (${sourceOrders.length} TOTAL ORDERS) ===
${allOrdersCompactIndex}
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
                this.appendMessage('assistant', `❌ **API Error**: ${err.message || 'Failed to connect to OpenRouter.'}\n\nPlease check your internet connection or try again.`);
            } finally {
                this.isGenerating = false;
            }
        }

        async callOpenRouterWithFallback(userPrompt) {
            const contextText = this.getDashboardContext(userPrompt);
            const systemPrompt = `You are the expert AI Analytics Assistant named "Janvi AI Assistance" for JANVI AIKA, a premium clothing & e-commerce brand.
Your job is to answer user questions, summarize live order statistics, explain trends, and offer actionable insights based strictly on the provided Live Dashboard Context.

STRICT RESPONSE FORMATTING RULES:
1. NEVER output raw JSON objects, JSON strings, or code blocks in your responses.
2. For tabular data, status breakdowns, or multi-column comparisons, ALWAYS format as clean Markdown tables with column headers (| Header 1 | Header 2 |).
3. Use section headings (### Section Title) to organize long responses into clear sections.
4. Use bolding (**text**) for key figures and bullet points (- item) for summaries.
5. Always use Indian Rupee (₹) formatting for currency.

${contextText}`;

            const messagesPayload = [
                { role: 'system', content: systemPrompt },
                ...this.history.slice(-6)
            ];

            let modelQueue = [...FREE_MODELS];
            let lastError = null;

            for (let i = 0; i < modelQueue.length; i++) {
                const currentModel = modelQueue[i];
                try {
                    const response = await fetch(OPENROUTER_ENDPOINT, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'HTTP-Referer': window.location.href || 'https://janvi-aika-dashboard.vercel.app',
                            'X-Title': 'Janvi AI Assistance',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: currentModel,
                            models: modelQueue.slice(i, i + 3),
                            messages: messagesPayload,
                            temperature: 0.3,
                            max_tokens: 1000
                        })
                    });

                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(`Model ${currentModel} returned ${response.status}: ${errData.error?.message || response.statusText}`);
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
                }
            }

            throw lastError || new Error('All free AI models were temporarily busy. Please try again in a few seconds.');
        }

        appendMessage(role, content) {
            const container = this.elements.messagesContainer;
            if (!container) return;

            const msgDiv = document.createElement('div');
            msgDiv.className = `ai-message ai-message-${role}`;

            const formattedContent = this.formatMarkdown(content);
            
            let actionBarHtml = '';
            if (role === 'assistant') {
                actionBarHtml = `
                    <div class="ai-action-bar">
                        <button class="ai-action-btn ai-copy-btn" title="Copy Response">📋 Copy</button>
                        <button class="ai-action-btn ai-regen-btn" title="Regenerate Response">🔄 Regenerate</button>
                        <button class="ai-action-btn ai-thumb-up" title="Helpful">👍</button>
                        <button class="ai-action-btn ai-thumb-down" title="Not Helpful">👎</button>
                    </div>
                `;
            }

            msgDiv.innerHTML = `
                <div class="ai-avatar">${role === 'user' ? '👤' : (role === 'system' ? '⚙️' : '✨')}</div>
                <div class="ai-bubble">
                    ${formattedContent}
                    ${actionBarHtml}
                </div>
            `;

            // Attach Copy Button Listener
            const copyBtn = msgDiv.querySelector('.ai-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(content).then(() => {
                        copyBtn.textContent = '✓ Copied!';
                        copyBtn.classList.add('copied');
                        setTimeout(() => {
                            copyBtn.textContent = '📋 Copy';
                            copyBtn.classList.remove('copied');
                        }, 2000);
                    });
                });
            }

            // Attach Regenerate Listener
            const regenBtn = msgDiv.querySelector('.ai-regen-btn');
            if (regenBtn) {
                regenBtn.addEventListener('click', () => {
                    if (this.history.length > 0 && !this.isGenerating) {
                        const lastUserMsg = [...this.history].reverse().find(m => m.role === 'user');
                        if (lastUserMsg) {
                            this.elements.userInput.value = lastUserMsg.content;
                            this.handleUserSubmit();
                        }
                    }
                });
            }

            // Attach Feedback Listeners
            const thumbUp = msgDiv.querySelector('.ai-thumb-up');
            const thumbDown = msgDiv.querySelector('.ai-thumb-down');
            if (thumbUp && thumbDown) {
                thumbUp.addEventListener('click', () => {
                    thumbUp.classList.toggle('active');
                    thumbDown.classList.remove('active');
                });
                thumbDown.addEventListener('click', () => {
                    thumbDown.classList.toggle('active');
                    thumbUp.classList.remove('active');
                });
            }

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
                    <span class="ai-loading-text">Analyzing live dashboard metrics...</span>
                </div>
            `;
            container.appendChild(loaderDiv);
            container.scrollTop = container.scrollHeight;
            return loaderDiv;
        }

        formatMarkdown(text) {
            if (!text) return '';

            // Sanitization
            let clean = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            // 1. Process Markdown Headings (### Heading, ## Heading, # Heading)
            clean = clean.replace(/^###\s+(.*$)/gim, '<h4 class="ai-heading">$1</h4>');
            clean = clean.replace(/^##\s+(.*$)/gim, '<h3 class="ai-heading">$1</h3>');
            clean = clean.replace(/^#\s+(.*$)/gim, '<h2 class="ai-heading">$1</h2>');

            // 2. Process Markdown Tables (| col 1 | col 2 |)
            const lines = clean.split('\n');
            let processedLines = [];
            let inTable = false;
            let tableHeader = [];
            let tableBody = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const isTableLine = line.startsWith('|') && line.endsWith('|');

                if (isTableLine) {
                    const cells = line.split('|').slice(1, -1).map(c => c.trim());
                    const isDivider = cells.every(c => /^:?-+:?$/.test(c));

                    if (isDivider) {
                        continue;
                    }

                    if (!inTable) {
                        inTable = true;
                        tableHeader = cells;
                        tableBody = [];
                    } else {
                        tableBody.push(cells);
                    }
                } else {
                    if (inTable) {
                        processedLines.push(this.renderHtmlTable(tableHeader, tableBody));
                        inTable = false;
                        tableHeader = [];
                        tableBody = [];
                    }
                    processedLines.push(line);
                }
            }

            if (inTable) {
                processedLines.push(this.renderHtmlTable(tableHeader, tableBody));
            }

            let html = processedLines.join('\n');

            // 3. Bold, Italics, Code, Links
            html = html
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

            // 4. Lists and Paragraphs
            const outputLines = html.split('\n');
            let result = '';
            let inList = false;

            outputLines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('<h') || trimmed.startsWith('<ul>') || trimmed.startsWith('<div class="ai-table-container">')) {
                    if (inList) { result += '</ul>'; inList = false; }
                    result += line;
                } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
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

        renderHtmlTable(headerCells, bodyRows) {
            let html = '<div class="ai-table-container"><table class="ai-table"><thead><tr>';
            headerCells.forEach(cell => {
                html += `<th>${cell}</th>`;
            });
            html += '</tr></thead><tbody>';

            bodyRows.forEach(row => {
                html += '<tr>';
                row.forEach(cell => {
                    html += `<td>${cell}</td>`;
                });
                html += '</tr>';
            });

            html += '</tbody></table></div>';
            return html;
        }
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.aiChatAssistant = new AIChatAssistant());
    } else {
        window.aiChatAssistant = new AIChatAssistant();
    }
})();
