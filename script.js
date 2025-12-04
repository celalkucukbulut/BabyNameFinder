document.addEventListener('DOMContentLoaded', () => {
    const resultsContainer = document.getElementById('results');
    const genderFilter = document.getElementById('gender');
    const originFilter = document.getElementById('origin');
    const syllablesFilter = document.getElementById('syllables');
    const lengthFilter = document.getElementById('length');
    const searchInput = document.getElementById('search');
    const excludeLettersInput = document.getElementById('exclude-letters');
    const quranFilter = document.getElementById('quran');
    const alphabetNav = document.getElementById('alphabet-nav');

    // Load Gemini-generated names from localStorage on page load
    loadGeminiNamesFromLocalStorage();

    // Helper function to save a Gemini-generated name to localStorage
    function saveGeminiNamesToLocalStorage(nameData) {
        try {
            let geminiNames = JSON.parse(localStorage.getItem('geminiNames') || '[]');

            // Check if name already exists (avoid duplicates)
            const exists = geminiNames.some(n => n.name.toLocaleLowerCase('tr') === nameData.name.toLocaleLowerCase('tr'));
            if (!exists) {
                geminiNames.push(nameData);
                localStorage.setItem('geminiNames', JSON.stringify(geminiNames));
            }
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    // Helper function to load Gemini names from localStorage
    function loadGeminiNamesFromLocalStorage() {
        try {
            const geminiNames = JSON.parse(localStorage.getItem('geminiNames') || '[]');

            // Add to namesData if they don't already exist
            geminiNames.forEach(name => {
                const exists = namesData.some(n => n.name.toLocaleLowerCase('tr') === name.name.toLocaleLowerCase('tr'));
                if (!exists) {
                    namesData.push(name);
                }
            });
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
    }

    function renderNames(names) {
        resultsContainer.innerHTML = '';

        if (names.length === 0) {
            // Show Gemini AI input for checking if text is a name
            resultsContainer.innerHTML = `
                <div class="no-results-container">
                    <p class="subtitle">Aradığınız kriterlere uygun isim bulunamadı.</p>
                    <div class="gemini-input-container">
                        <p class="gemini-prompt">Bir isim mi kontrol etmek ister misiniz?</p>
                        <input 
                            type="text" 
                            id="gemini-name-input" 
                            class="gemini-input" 
                            placeholder="İsim girin (max 30 karakter)..." 
                            maxlength="30"
                        >
                        <button id="gemini-check-btn" class="gemini-check-btn">Kontrol Et</button>
                        <div id="gemini-loading" class="gemini-loading" style="display: none;">
                            <div class="spinner"></div>
                            <p>Kontrol ediliyor...</p>
                        </div>
                        <div id="gemini-error" class="gemini-error" style="display: none;"></div>
                    </div>
                </div>
            `;

            // Add event listener for the check button
            const checkBtn = document.getElementById('gemini-check-btn');
            const nameInput = document.getElementById('gemini-name-input');

            if (checkBtn && nameInput) {
                checkBtn.addEventListener('click', () => checkNameWithGemini());
                nameInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        checkNameWithGemini();
                    }
                });
            }

            return;
        }

        names.forEach(name => {
            const card = document.createElement('div');
            card.className = 'name-card';
            // Add data-letter attribute for navigation
            card.setAttribute('data-letter', name.name.charAt(0).toUpperCase());

            // Map Turkish gender values to CSS classes
            let genderClass = 'gender-unisex';
            if (name.gender === 'Kız') genderClass = 'gender-girl';
            if (name.gender === 'Erkek') genderClass = 'gender-boy';

            const quranBadge = name.inQuran ? '<span class="quran-badge" title="Kuran\'da geçiyor">📖</span>' : '';

            card.innerHTML = `
                <div class="name-header">
                    <span class="name-text">${name.name}</span>
                    <span class="gender-badge ${genderClass}">${name.gender}</span>
                </div>
                <div class="meta-info">
                    <div class="origin-tag">${name.origin}</div>
                    ${quranBadge}
                </div>
                <div class="meaning">
                    "${name.meaning}"
                </div>
            `;

            resultsContainer.appendChild(card);
        });
    }

    async function checkNameWithGemini() {
        const nameInput = document.getElementById('gemini-name-input');
        const loadingDiv = document.getElementById('gemini-loading');
        const errorDiv = document.getElementById('gemini-error');
        const checkBtn = document.getElementById('gemini-check-btn');

        const nameValue = nameInput.value.trim();

        // Validate input
        if (!nameValue) {
            errorDiv.textContent = 'Lütfen bir isim girin.';
            errorDiv.style.display = 'block';
            return;
        }

        if (nameValue.length > 30) {
            errorDiv.textContent = 'İsim en fazla 30 karakter olabilir.';
            errorDiv.style.display = 'block';
            return;
        }

        // Check if name already exists in database (case-insensitive)
        const existingName = namesData.find(n => n.name.toLocaleLowerCase('tr') === nameValue.toLocaleLowerCase('tr'));
        if (existingName) {
            errorDiv.style.display = 'none';
            displayGeminiNameCard(existingName, true); // Pass true to indicate it's from cache
            nameInput.value = ''; // Clear input for next query
            return;
        }

        // Hide error, show loading
        errorDiv.style.display = 'none';
        loadingDiv.style.display = 'flex';
        checkBtn.disabled = true;

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt: nameValue })
            });

            const data = await response.json();

            // Hide loading
            loadingDiv.style.display = 'none';
            checkBtn.disabled = false;

            if (!response.ok) {
                throw new Error(data.error || 'Bir hata oluştu');
            }

            // Check if it's a valid name
            if (data.isName === false) {
                errorDiv.textContent = 'Bu bir isim gibi görünmüyor. Lütfen geçerli bir isim girin.';
                errorDiv.style.display = 'block';
                return;
            }

            // Save to namesData array
            namesData.push(data);

            // Save to localStorage for persistence across sessions
            saveGeminiNamesToLocalStorage(data);

            // Display the name card with Gemini data
            displayGeminiNameCard(data, false);

            // Clear input for next query
            nameInput.value = '';

        } catch (error) {
            loadingDiv.style.display = 'none';
            checkBtn.disabled = false;
            errorDiv.textContent = `Hata: ${error.message}. Lütfen tekrar deneyin.`;
            errorDiv.style.display = 'block';
            console.error('Gemini API Error:', error);
        }
    }

    function displayGeminiNameCard(nameData, fromCache = false) {
        // Find the results container for Gemini cards
        let geminiResultsContainer = document.getElementById('gemini-results-container');

        // If it doesn't exist, create it and keep the input visible
        if (!geminiResultsContainer) {
            geminiResultsContainer = document.createElement('div');
            geminiResultsContainer.id = 'gemini-results-container';
            geminiResultsContainer.className = 'gemini-results-container';

            // Insert after the input container
            const inputContainer = document.querySelector('.gemini-input-container');
            if (inputContainer && inputContainer.parentNode) {
                inputContainer.parentNode.insertBefore(geminiResultsContainer, inputContainer.nextSibling);
            }
        }

        // Create a name card similar to the existing ones
        const card = document.createElement('div');
        card.className = 'name-card gemini-result';
        card.setAttribute('data-letter', nameData.name.charAt(0).toUpperCase());

        // Map gender to CSS classes
        let genderClass = 'gender-unisex';
        if (nameData.gender === 'Kız') genderClass = 'gender-girl';
        if (nameData.gender === 'Erkek') genderClass = 'gender-boy';

        const quranBadge = nameData.inQuran ? '<span class="quran-badge" title="Kuran\'da geçiyor">📖</span>' : '';
        const badgeText = fromCache ? '💾 Veritabanından' : '✨ Yapay Zeka ile oluşturuldu';

        card.innerHTML = `
            <div class="gemini-badge">${badgeText}</div>
            <div class="name-header">
                <span class="name-text">${nameData.name}</span>
                <span class="gender-badge ${genderClass}">${nameData.gender}</span>
            </div>
            <div class="meta-info">
                <div class="origin-tag">${nameData.origin}</div>
                ${quranBadge}
            </div>
            <div class="meaning">
                "${nameData.meaning}"
            </div>
            <div class="gemini-extra-info">
                <span>Hece: ${nameData.syllables}</span>
                <span>Uzunluk: ${nameData.length}</span>
            </div>
        `;

        // Add to the top of results (most recent first)
        geminiResultsContainer.insertBefore(card, geminiResultsContainer.firstChild);
    }

    function filterNames() {
        const genderValue = genderFilter.value;
        const originValue = originFilter.value;
        const syllablesValue = syllablesFilter.value;
        const lengthValue = lengthFilter.value;
        const searchValue = searchInput.value.toLocaleLowerCase('tr');
        const excludeLettersValue = excludeLettersInput.value;
        const quranValue = quranFilter.checked;

        const filtered = namesData.filter(item => {
            // Gender Logic
            let matchGender = false;
            if (genderValue === 'Tümü') {
                matchGender = true;
            } else if (genderValue === 'Kız') {
                matchGender = item.gender === 'Kız' || item.gender === 'Her ikisi';
            } else if (genderValue === 'Erkek') {
                matchGender = item.gender === 'Erkek' || item.gender === 'Her ikisi';
            } else {
                matchGender = item.gender === genderValue;
            }

            const matchOrigin = originValue === 'Tümü' || item.origin === originValue;
            const matchSyllables = syllablesValue === 'Tümü' ||
                (syllablesValue === '4' ? item.syllables >= 4 : item.syllables === parseInt(syllablesValue));
            const matchLength = !lengthValue || item.length <= parseInt(lengthValue);
            const matchSearch = item.name.toLocaleLowerCase('tr').includes(searchValue);
            const matchQuran = !quranValue || item.inQuran;

            // Exclude letters filter
            let matchExclude = true;
            if (excludeLettersValue) {
                const excludedLetters = excludeLettersValue.split('-').map(l => l.trim().toLocaleLowerCase('tr')).filter(l => l);
                const nameLower = item.name.toLocaleLowerCase('tr');
                matchExclude = !excludedLetters.some(letter => nameLower.includes(letter));
            }

            return matchGender && matchOrigin && matchSyllables && matchLength && matchSearch && matchExclude && matchQuran;
        });

        renderNames(filtered);
    }

    function generateAlphabetNav() {
        const alphabet = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ";
        alphabetNav.innerHTML = '';

        alphabet.split('').forEach(letter => {
            const link = document.createElement('a');
            link.className = 'alphabet-link';
            link.textContent = letter;
            link.onclick = (e) => {
                e.preventDefault();
                scrollToLetter(letter);
            };
            alphabetNav.appendChild(link);
        });
    }

    function scrollToLetter(letter) {
        // Find the first card that starts with the letter
        const cards = document.querySelectorAll('.name-card');
        for (const card of cards) {
            if (card.getAttribute('data-letter') === letter) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Highlight active letter
                document.querySelectorAll('.alphabet-link').forEach(l => l.classList.remove('active'));
                const activeLink = Array.from(document.querySelectorAll('.alphabet-link')).find(l => l.textContent === letter);
                if (activeLink) activeLink.classList.add('active');

                return;
            }
        }
    }

    // Event Listeners
    genderFilter.addEventListener('change', filterNames);
    originFilter.addEventListener('change', filterNames);
    syllablesFilter.addEventListener('change', filterNames);
    lengthFilter.addEventListener('input', filterNames);
    searchInput.addEventListener('input', filterNames);
    quranFilter.addEventListener('change', filterNames);

    // Exclude letters input formatting
    excludeLettersInput.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
            e.preventDefault();
            const value = excludeLettersInput.value;
            if (value.length > 0) {
                // Remove the last character and the preceding dash (if exists)
                if (value.endsWith('-')) {
                    excludeLettersInput.value = value.slice(0, -1);
                } else {
                    // Remove letter and its dash
                    const newValue = value.slice(0, -1);
                    excludeLettersInput.value = newValue.endsWith('-') ? newValue.slice(0, -1) : newValue;
                }
                filterNames();
            }
        }
    });

    excludeLettersInput.addEventListener('input', (e) => {
        let value = e.target.value.toLocaleUpperCase('tr');

        // Remove invalid characters (only allow letters and dashes)
        value = value.replace(/[^A-ZÇĞİÖŞÜ\\-]/g, '');

        // Remove consecutive dashes
        value = value.replace(/-+/g, '-');

        // Auto-add dash after each letter (if not already present)
        if (value.length > 0 && !value.endsWith('-')) {
            const lastChar = value[value.length - 1];
            if (lastChar !== '-' && value.length > 1) {
                const beforeLast = value[value.length - 2];
                if (beforeLast !== '-') {
                    // Insert dash before the last character
                    value = value.slice(0, -1) + '-' + lastChar;
                }
            }
        }

        excludeLettersInput.value = value;
        filterNames();
    });

    // Clear filters button
    const clearButton = document.getElementById('clear-filters');
    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        genderFilter.value = 'Tümü';
        originFilter.value = 'Tümü';
        syllablesFilter.value = 'Tümü';
        lengthFilter.value = '';
        excludeLettersInput.value = '';
        quranFilter.checked = false;
        filterNames();
    });

    // Toggle filters on mobile
    const toggleFiltersBtn = document.getElementById('toggle-filters');
    const filtersSection = document.querySelector('.filters');

    if (toggleFiltersBtn) {
        toggleFiltersBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filtersSection.classList.toggle('expanded');
        });
    }

    // Mobile close button (Tamam)
    const mobileCloseBtn = document.getElementById('mobile-close-btn');
    if (mobileCloseBtn) {
        mobileCloseBtn.addEventListener('click', () => {
            filtersSection.classList.remove('expanded');
        });
    }

    // Make filter header h2 clickable to toggle
    const filterHeader = document.querySelector('.filter-header');
    if (filterHeader) {
        filterHeader.addEventListener('click', () => {
            filtersSection.classList.toggle('expanded');
        });
    }

    // Initial render
    renderNames(namesData);
    generateAlphabetNav();
});
