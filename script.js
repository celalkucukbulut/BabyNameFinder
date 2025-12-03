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

    function renderNames(names) {
        resultsContainer.innerHTML = '';

        if (names.length === 0) {
            resultsContainer.innerHTML = '<p class="subtitle" style="text-align: center; grid-column: 1/-1;">Aradığınız kriterlere uygun isim bulunamadı.</p>';
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
        value = value.replace(/[^A-ZÇĞİÖŞÜ\-]/g, '');

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
        toggleFiltersBtn.addEventListener('click', () => {
            filtersSection.classList.toggle('expanded');
        });
    }

    // Initial render
    renderNames(namesData);
    generateAlphabetNav();
});
