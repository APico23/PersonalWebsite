const SUPABASE_URL = "https://fupysqufnvblxyocqxey.supabase.co";
const SUPABASE_KEY = "sb_publishable_BdHgtwQxbguQOgkAc9gNqg_8uLcLA8e";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const libraryState = {
  books: [],
  activeFilter: "all",
  session: null,
  isAdmin: false,
  manageBound: false
};

document.addEventListener("DOMContentLoaded", () => {
  initializeLibrary().catch((error) => {
    setGlobalStatus(error.message || "Unexpected error.", "error");
  });
});

async function initializeLibrary() {
  const page = document.body.dataset.page;
  highlightCurrentNav(page);

  if (!supabaseClient) {
    setGlobalStatus("Supabase failed to load. Check your connection and try again.", "error");
    return;
  }

  bindAuthControls();
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }
  await applySession(data.session);

  if (page === "catalog" || page === "wishlist") {
    bindCatalogControls();
    await loadBooks();
    renderCatalogPage();
  } else if (page === "manage") {
    bindManageControls();
    if (libraryState.isAdmin) {
      await refreshManagePage();
    }
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      handleAuthChange(session).catch((authError) => {
        setGlobalStatus(authError.message || "Could not update sign-in state.", "error");
      });
    }, 0);
  });
}

async function handleAuthChange(session) {
  await applySession(session);

  if (document.body.dataset.page === "manage" && libraryState.isAdmin) {
    await refreshManagePage();
  }

}

async function applySession(session) {
  libraryState.session = session;
  libraryState.isAdmin = false;

  if (session) {
    const { data, error } = await supabaseClient.rpc("is_portfolio_admin");
    if (error) {
      throw new Error(error.message);
    }
    libraryState.isAdmin = data === true;
  }

  renderAuthState();
}

function highlightCurrentNav(page) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.nav === page);
  });
}

function bindAuthControls() {
  const loginForm = document.getElementById("loginForm");
  const signOutButton = document.getElementById("signOutButton");

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.namedItem("email").value.trim();
    setLocalStatus("authStatus", "Sending sign-in link...", "info");

    const redirectUrl = new URL(window.location.href);
    redirectUrl.hash = "";
    redirectUrl.search = "";

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl.toString() }
    });

    if (error) {
      setLocalStatus("authStatus", error.message, "error");
      return;
    }

    form.reset();
    setLocalStatus("authStatus", "Sign-in link sent. Check your email.", "success");
  });

  signOutButton?.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      setLocalStatus("authStatus", error.message, "error");
    }
  });
}

function renderAuthState() {
  const signedOutView = document.getElementById("signedOutView");
  const signedInView = document.getElementById("signedInView");
  const signedInEmail = document.getElementById("signedInEmail");
  const adminOnly = document.getElementById("adminOnly");

  if (signedOutView) {
    signedOutView.hidden = Boolean(libraryState.session);
  }
  if (signedInView) {
    signedInView.hidden = !libraryState.session;
  }
  if (signedInEmail) {
    signedInEmail.textContent = libraryState.session?.user?.email || "authenticated account";
  }
  if (adminOnly) {
    adminOnly.hidden = !libraryState.isAdmin;
  }

  if (libraryState.session && !libraryState.isAdmin) {
    setLocalStatus("authStatus", "This account is signed in but is not a portfolio administrator.", "error");
  } else if (libraryState.session && libraryState.isAdmin) {
    setLocalStatus("authStatus", "Administrator access enabled.", "success");
  }
}

async function loadBooks() {
  const { data, error } = await supabaseClient
    .from("library_books")
    .select("*")
    .order("title", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  libraryState.books = data || [];
}

function bindCatalogControls() {
  bindBookDialog();
  if (document.body.dataset.page === "catalog") {
    let capacity = getShelfCapacity();
    const observer = new ResizeObserver(() => {
      const nextCapacity = getShelfCapacity();
      if (nextCapacity !== capacity) {
        capacity = nextCapacity;
        renderCatalog();
      }
    });
    observer.observe(document.getElementById("bookGrid"));
  }
  document.getElementById("bookSearch").addEventListener("input", renderCatalog);
  document.getElementById("bookSort").addEventListener("change", renderCatalog);
  document.getElementById("bookFilters").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) {
      return;
    }

    libraryState.activeFilter = button.dataset.filter;
    document.querySelectorAll("#bookFilters button").forEach((filterButton) => {
      filterButton.setAttribute("aria-pressed", String(filterButton === button));
    });
    renderCatalog();
  });
}

function renderCatalogPage() {
  const owned = libraryState.books.filter((book) => book.ownership_status === "owned");
  const wanted = libraryState.books.filter((book) => book.ownership_status === "wanted");
  const read = owned.filter((book) => book.reading_status === "read");
  const rated = owned.filter((book) => book.rating !== null && book.rating !== undefined)
    .sort((left, right) => Number(right.rating) - Number(left.rating) || left.title.localeCompare(right.title));

  setText("ownedCount", owned.length);
  setText("readingCount", owned.filter((book) => book.reading_status === "reading").length);
  setText("wantedCount", wanted.length);
  setText("readCount", read.length);
  setText("favoriteBook", rated[0]?.title || "No rated books yet");
  renderCatalog();
}

function renderCatalog() {
  const search = document.getElementById("bookSearch").value.trim().toLowerCase();
  const ownership = document.body.dataset.page === "wishlist" ? "wanted" : "owned";
  const filteredBooks = libraryState.books.filter((book) => {
    if (book.ownership_status !== ownership) {
      return false;
    }
    const matchesFilter = libraryState.activeFilter === "all"
      || libraryState.activeFilter === book.reading_status;

    if (!matchesFilter) {
      return false;
    }

    if (!search) {
      return true;
    }

    const searchable = [
      book.title,
      book.subtitle,
      ...(book.authors || []),
      ...(book.genres || []),
      book.publisher,
      book.series_name
    ].filter(Boolean).join(" ").toLowerCase();

    return searchable.includes(search);
  });

  const sort = document.getElementById("bookSort").value;
  filteredBooks.sort((left, right) => {
    if (sort === "rating") {
      return (right.rating ?? -1) - (left.rating ?? -1) || left.title.localeCompare(right.title);
    }
    if (sort === "author") {
      return (left.authors?.[0] || "").localeCompare(right.authors?.[0] || "") || left.title.localeCompare(right.title);
    }
    return left.title.localeCompare(right.title);
  });

  setText(
    "catalogCount",
    `${filteredBooks.length} book${filteredBooks.length === 1 ? "" : "s"}`
  );

  const grid = document.getElementById("bookGrid");
  grid.replaceChildren();

  if (!filteredBooks.length) {
    grid.append(createMessage("No books match this view."));
    return;
  }

  const fragment = document.createDocumentFragment();
  if (document.body.dataset.page === "catalog") {
    const genres = new Map();
    filteredBooks.forEach((book) => {
      const genre = (book.genres || []).find((value) => value?.trim())?.trim() || "Uncategorized";
      const key = genre.toLowerCase();
      if (!genres.has(key)) {
        genres.set(key, { name: genre, books: [] });
      }
      genres.get(key).books.push(book);
    });
    const orderedBooks = [...genres.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .flatMap((genre) => genre.books.map((book) => ({ book, genre: genre.name })));
    const capacity = getShelfCapacity();
    for (let offset = 0; offset < orderedBooks.length; offset += capacity) {
      const shelf = createElement("section", "book-shelf");
      shelf.setAttribute("aria-label", `Bookshelf ${Math.floor(offset / capacity) + 1}`);
      shelf.style.setProperty("--shelf-capacity", capacity);
      const books = createElement("div", "shelf-books");
      const row = orderedBooks.slice(offset, offset + capacity);
      const labels = [];
      row.forEach(({ book, genre }) => {
        books.append(createBookSpine(book));
        const previous = labels[labels.length - 1];
        if (previous?.genre === genre) {
          previous.count += 1;
        } else {
          labels.push({ genre, count: 1 });
        }
      });
      const base = createElement("div", "shelf-base");
      labels.forEach(({ genre, count }) => {
        const label = createElement("h3", "shelf-genre", genre);
        label.style.gridColumn = `span ${count}`;
        label.title = genre;
        label.tabIndex = 0;
        base.append(label);
      });
      shelf.append(books, base);
      fragment.append(shelf);
    }
  } else {
    filteredBooks.forEach((book) => fragment.append(createBookCard(book)));
  }
  grid.append(fragment);
}

function getShelfCapacity() {
  return Math.max(1, Math.floor((document.getElementById("bookGrid").clientWidth - 24) / 76));
}

function createBookSpine(book) {
  const colors = ["#4e1926", "#173d30", "#642a32", "#234e3b", "#702b29", "#24382f", "#443025"];
  const seed = [...(book.book_id || book.title)].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 0);
  const slot = createElement("div", "spine-slot");
  const spine = createElement("button", "book-spine");
  spine.type = "button";
  spine.style.setProperty("--spine-color", colors[seed % colors.length]);
  spine.style.setProperty("--spine-height", `${232 + seed % 35}px`);
  spine.style.setProperty("--spine-font", book.title.length > 50 ? "0.72rem" : "0.92rem");
  spine.setAttribute("aria-label", `${book.title}, ${book.authors?.join(", ") || "Unknown author"}. View book details`);
  spine.setAttribute("aria-haspopup", "dialog");
  spine.title = book.title;
  const text = createElement("span", "spine-text");
  text.append(createElement("span", "spine-title", book.title));
  text.append(createElement("span", "spine-author", book.authors?.join(", ") || "Unknown author"));
  spine.append(text);
  if (book.rating !== null && book.rating !== undefined) {
    spine.append(createElement("span", "spine-rating", `${formatBookRating(book.rating)}/10`));
  }
  spine.addEventListener("click", () => openBookDialog(book));
  slot.append(spine);
  return slot;
}

function bindBookDialog() {
  const dialog = createElement("dialog", "book-dialog");
  dialog.id = "bookDialog";
  dialog.setAttribute("aria-labelledby", "bookDialogTitle");
  const header = createElement("div", "book-dialog-header");
  const title = createElement("h2");
  title.id = "bookDialogTitle";
  const close = createElement("button", "book-dialog-close", "\u00d7");
  close.type = "button";
  close.setAttribute("aria-label", "Close book details");
  close.title = "Close book details";
  close.addEventListener("click", () => dialog.close());
  header.append(title, close);
  const body = createElement("div", "book-dialog-body");
  body.id = "bookDialogBody";
  dialog.append(header, body);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
  });
  document.body.append(dialog);
}

function openBookDialog(book) {
  setText("bookDialogTitle", book.title);
  const body = document.getElementById("bookDialogBody");
  body.replaceChildren();
  const overview = createElement("div", "book-detail-overview");
  overview.append(createBookCover(book, "book-detail-cover", "book-detail-cover cover-fallback"));
  const copy = createElement("div", "book-detail-copy");
  if (book.subtitle) {
    copy.append(createElement("p", "book-detail-subtitle", book.subtitle));
  }
  copy.append(createElement("p", "", book.authors?.join(", ") || "Unknown author"));
  copy.append(createElement("p", "book-detail-rating", book.rating === null || book.rating === undefined ? "Not rated" : `${formatBookRating(book.rating)} / 10`));
  const facts = createElement("dl", "book-detail-facts");
  const entries = [
    ["Collection", formatOwnershipStatus(book.ownership_status)],
    ["Reading", formatReadingStatus(book.reading_status)],
    ["Genres", book.genres?.join(", ")],
    ["Published", book.published_year],
    ["Publisher", book.publisher],
    ["Format", book.book_format],
    ["Pages", book.page_count],
    ["Language", book.language],
    ["Series", [book.series_name, book.series_number !== null && book.series_number !== undefined ? `#${book.series_number}` : null].filter(Boolean).join(" ")],
    ["ISBN-13", book.isbn_13],
    ["ISBN-10", book.isbn_10],
    ["Started", book.date_started],
    ["Finished", book.date_finished]
  ];
  entries.forEach(([label, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      facts.append(createElement("dt", "", label), createElement("dd", "", value));
    }
  });
  copy.append(facts);
  overview.append(copy);
  body.append(overview);
  [["About the book", book.description], ["Personal notes", book.notes]].forEach(([label, value]) => {
    if (value) {
      const section = createElement("section", "book-detail-section");
      section.append(createElement("h3", "", label), createElement("p", "", value));
      body.append(section);
    }
  });
  document.getElementById("bookDialog").showModal();
}

function createBookCard(book) {
  const card = createElement("article", "book-card");
  card.append(createBookCover(book, "book-cover", "cover-fallback"));

  const content = createElement("div", "book-card-content");
  if (book.rating !== null && book.rating !== undefined) {
    content.append(createElement("span", "book-rating", `${formatBookRating(book.rating)} / 10`));
  }
  content.append(createElement("h3", "", book.title));

  const authorText = book.authors?.length ? book.authors.join(", ") : "Unknown author";
  content.append(createElement("p", "book-authors", authorText));

  const details = [
    book.published_year,
    book.book_format,
    book.page_count ? `${book.page_count} pages` : null
  ].filter(Boolean).join(", ");
  if (details) {
    content.append(createElement("p", "book-meta", details));
  }

  const tags = createElement("div", "tag-row");
  const shelfTag = createElement(
    "span",
    `status-tag${book.ownership_status === "wanted" ? " wanted" : ""}`,
    book.ownership_status === "wanted" ? "Want to own" : formatReadingStatus(book.reading_status)
  );
  tags.append(shelfTag);

  (book.genres || []).slice(0, 2).forEach((genre) => {
    tags.append(createElement("span", "tag", genre));
  });

  content.append(tags);
  const detailsButton = createElement("button", "button-secondary", "Book details");
  detailsButton.type = "button";
  detailsButton.setAttribute("aria-haspopup", "dialog");
  detailsButton.addEventListener("click", () => openBookDialog(book));
  content.append(detailsButton);
  card.append(content);
  return card;
}

function formatBookRating(rating) {
  return Number(rating).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function bindManageControls() {
  if (libraryState.manageBound) {
    return;
  }
  libraryState.manageBound = true;

  document.getElementById("bookForm").addEventListener("submit", saveBook);
  document.getElementById("cancelBookEdit").addEventListener("click", resetBookForm);
  document.getElementById("isbnLookupButton").addEventListener("click", lookupBookByIsbn);
  document.getElementById("titleLookupButton").addEventListener("click", lookupBooksByTitle);
}

async function refreshManagePage() {
  await loadBooks();
  renderManageBookList();
}

async function saveBook(event) {
  event.preventDefault();
  if (!libraryState.isAdmin) {
    setLocalStatus("bookFormStatus", "Administrator access required.", "error");
    return;
  }

  const form = event.currentTarget;
  const authors = splitList(formControl(form, "authors").value);
  if (!authors.length) {
    setLocalStatus("bookFormStatus", "Add at least one author.", "error");
    return;
  }

  const payload = {
    title: formControl(form, "title").value.trim(),
    subtitle: optionalText(formControl(form, "subtitle").value),
    authors,
    genres: splitList(formControl(form, "genres").value),
    isbn_10: optionalText(formControl(form, "isbn10").value),
    isbn_13: optionalText(formControl(form, "isbn13").value),
    open_library_key: optionalText(formControl(form, "openLibraryKey").value),
    publisher: optionalText(formControl(form, "publisher").value),
    published_year: optionalNumber(formControl(form, "publishedYear").value),
    page_count: optionalNumber(formControl(form, "pageCount").value),
    language: optionalText(formControl(form, "language").value),
    book_format: optionalText(formControl(form, "bookFormat").value),
    series_name: optionalText(formControl(form, "seriesName").value),
    series_number: optionalNumber(formControl(form, "seriesNumber").value),
    cover_url: optionalText(formControl(form, "coverUrl").value),
    ownership_status: formControl(form, "ownershipStatus").value,
    reading_status: formControl(form, "readingStatus").value,
    rating: optionalNumber(formControl(form, "rating").value),
    date_started: optionalText(formControl(form, "dateStarted").value),
    date_finished: optionalText(formControl(form, "dateFinished").value),
    description: optionalText(formControl(form, "description").value),
    notes: optionalText(formControl(form, "notes").value)
  };

  if (payload.rating !== null && (!Number.isFinite(payload.rating) || payload.rating < 0 || payload.rating > 10)) {
    setLocalStatus("bookFormStatus", "Rating must be between 0 and 10.", "error");
    return;
  }

  const bookId = formControl(form, "bookId").value;
  setLocalStatus("bookFormStatus", "Saving book...", "info");

  const result = bookId
    ? await supabaseClient.from("library_books").update(payload).eq("book_id", bookId)
    : await supabaseClient.from("library_books").insert(payload);

  if (result.error) {
    setLocalStatus("bookFormStatus", result.error.message, "error");
    return;
  }

  resetBookForm();
  setLocalStatus("bookFormStatus", bookId ? "Book updated." : "Book added.", "success");
  await refreshManagePage();
}

function renderManageBookList() {
  setText(
    "manageBookCount",
    `${libraryState.books.length} record${libraryState.books.length === 1 ? "" : "s"}`
  );

  const list = document.getElementById("manageBookList");
  list.replaceChildren();

  if (!libraryState.books.length) {
    list.append(createMessage("No books have been added."));
    return;
  }

  const fragment = document.createDocumentFragment();
  libraryState.books.forEach((book) => {
    const row = createElement("article", "record-row");
    const main = createElement("div", "record-main");
    main.append(createElement("h3", "", book.title));
    main.append(createElement(
      "p",
      "",
      `${book.authors?.join(", ") || "Unknown author"}, ${formatOwnershipStatus(book.ownership_status)}, ${formatReadingStatus(book.reading_status)}${book.rating !== null && book.rating !== undefined ? `, ${formatBookRating(book.rating)}/10` : ""}`
    ));

    const actions = createElement("div", "record-actions");
    const editButton = createElement("button", "button-secondary", "Edit");
    const deleteButton = createElement("button", "button-danger", "Delete");
    editButton.type = "button";
    deleteButton.type = "button";
    editButton.addEventListener("click", () => startEditingBook(book));
    deleteButton.addEventListener("click", () => deleteBook(book));
    actions.append(editButton, deleteButton);

    row.append(main, actions);
    fragment.append(row);
  });
  list.append(fragment);
}

function startEditingBook(book) {
  const form = document.getElementById("bookForm");
  const values = {
    bookId: book.book_id,
    title: book.title,
    subtitle: book.subtitle,
    authors: book.authors?.join(", "),
    genres: book.genres?.join(", "),
    isbn10: book.isbn_10,
    isbn13: book.isbn_13,
    openLibraryKey: book.open_library_key,
    publisher: book.publisher,
    publishedYear: book.published_year,
    pageCount: book.page_count,
    language: book.language,
    bookFormat: book.book_format,
    seriesName: book.series_name,
    seriesNumber: book.series_number,
    coverUrl: book.cover_url,
    ownershipStatus: book.ownership_status,
    readingStatus: book.reading_status,
    rating: book.rating,
    dateStarted: book.date_started,
    dateFinished: book.date_finished,
    description: book.description,
    notes: book.notes
  };

  Object.entries(values).forEach(([name, value]) => {
    formControl(form, name).value = value ?? "";
  });

  setText("bookFormHeading", `Edit ${book.title}`);
  setText("saveBookButton", "Update book");
  document.getElementById("cancelBookEdit").hidden = false;
  setLocalStatus("bookFormStatus", "", "info");
  form.scrollIntoView({ block: "start" });
}

function resetBookForm() {
  const form = document.getElementById("bookForm");
  form.reset();
  formControl(form, "bookId").value = "";
  clearBookLookupResults();
  setText("bookFormHeading", "Add a book");
  setText("saveBookButton", "Save book");
  document.getElementById("cancelBookEdit").hidden = true;
}

async function deleteBook(book) {
  if (!window.confirm(`Delete ${book.title}?`)) {
    return;
  }

  const { error } = await supabaseClient
    .from("library_books")
    .delete()
    .eq("book_id", book.book_id);

  if (error) {
    setGlobalStatus(error.message, "error");
    return;
  }

  await refreshManagePage();
  setGlobalStatus(`${book.title} deleted.`, "success");
}

async function lookupBookByIsbn() {
  const form = document.getElementById("bookForm");
  const isbn13Control = formControl(form, "isbn13");
  const isbn10Control = formControl(form, "isbn10");
  const isbn = normalizeIsbn(isbn13Control.value || isbn10Control.value);

  if (![10, 13].includes(isbn.length)) {
    setLocalStatus("bookFormStatus", "Enter a valid ISBN-10 or ISBN-13 first.", "error");
    return;
  }

  setLocalStatus("bookFormStatus", "Looking up book details...", "info");
  const key = `ISBN:${isbn}`;
  const response = await fetch(
    `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&jscmd=data&format=json`
  );

  if (!response.ok) {
    setLocalStatus("bookFormStatus", "Open Library lookup failed. Try again later.", "error");
    return;
  }

  const result = await response.json();
  const book = result[key];
  if (!book) {
    setLocalStatus("bookFormStatus", "No Open Library record matched that ISBN.", "error");
    return;
  }

  const publishedYear = String(book.publish_date || "").match(/\b(\d{4})\b/)?.[1] || "";
  const openLibraryKey = book.identifiers?.openlibrary?.[0] || "";

  setFormValue(form, "title", book.title);
  setFormValue(form, "subtitle", book.subtitle);
  setFormValue(form, "authors", book.authors?.map((author) => author.name).join(", "));
  setFormValue(form, "genres", book.subjects?.slice(0, 10).map((subject) => subject.name).join(", "));
  setFormValue(form, "publisher", book.publishers?.[0]?.name);
  setFormValue(form, "publishedYear", publishedYear);
  setFormValue(form, "pageCount", book.number_of_pages);
  setFormValue(form, "coverUrl", book.cover?.large || book.cover?.medium);
  setFormValue(form, "openLibraryKey", openLibraryKey);
  clearBookLookupResults();

  if (isbn.length === 13) {
    isbn13Control.value = isbn;
  } else {
    isbn10Control.value = isbn;
  }

  setLocalStatus("bookFormStatus", "Book details loaded. Review them before saving.", "success");
}

async function lookupBooksByTitle() {
  const form = document.getElementById("bookForm");
  const title = formControl(form, "title").value.trim();
  const author = splitList(formControl(form, "authors").value)[0] || "";
  if (title.length < 2) {
    setLocalStatus("bookFormStatus", "Enter at least two title characters first.", "error");
    return;
  }

  setLocalStatus("bookFormStatus", "Searching Open Library...", "info");
  const parameters = new URLSearchParams({
    title,
    fields: "key,title,subtitle,author_name,first_publish_year,cover_i,subject",
    limit: "8"
  });
  if (author) {
    parameters.set("author", author);
  }

  let response;
  try {
    response = await fetch(`https://openlibrary.org/search.json?${parameters}`);
  } catch (_error) {
    setLocalStatus("bookFormStatus", "Open Library search failed. Try again later.", "error");
    return;
  }
  if (!response.ok) {
    setLocalStatus("bookFormStatus", "Open Library search failed. Try again later.", "error");
    return;
  }

  const result = await response.json();
  const books = Array.isArray(result.docs) ? result.docs.filter((book) => book?.key && book?.title) : [];
  renderBookLookupResults(books);
  setLocalStatus(
    "bookFormStatus",
    books.length ? "Choose the closest match below. Edition details may vary." : "No Open Library records matched that title and author.",
    books.length ? "info" : "error"
  );
}

function renderBookLookupResults(books) {
  const container = document.getElementById("bookLookupResults");
  container.replaceChildren();
  container.hidden = !books.length;

  books.forEach((book) => {
    const row = createElement("article", "record-row");
    const main = createElement("div", "record-main");
    main.append(createElement("h3", "", book.title));
    main.append(createElement(
      "p",
      "",
      [book.author_name?.join(", "), book.first_publish_year ? `First published ${book.first_publish_year}` : null]
        .filter(Boolean)
        .join(" | ")
    ));

    const chooseButton = createElement("button", "button-secondary", "Use this record");
    chooseButton.type = "button";
    chooseButton.addEventListener("click", () => applyBookLookupResult(book));
    row.append(main, chooseButton);
    container.append(row);
  });
}

async function applyBookLookupResult(book) {
  const form = document.getElementById("bookForm");
  setLocalStatus("bookFormStatus", "Loading work details...", "info");

  let work = {};
  if (/^\/works\/OL\d+W$/.test(book.key)) {
    try {
      const response = await fetch(`https://openlibrary.org${book.key}.json`);
      if (response.ok) {
        work = await response.json();
      }
    } catch (_error) {
      work = {};
    }
  }

  const description = typeof work.description === "string"
    ? work.description
    : work.description?.value;
  const subjects = Array.isArray(work.subjects) && work.subjects.length ? work.subjects : book.subject;

  setFormValue(form, "title", book.title);
  setFormValue(form, "subtitle", book.subtitle);
  setFormValue(form, "authors", book.author_name?.join(", "));
  setFormValue(form, "genres", subjects?.slice(0, 10).join(", "));
  setFormValue(form, "coverUrl", book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : "");
  setFormValue(form, "openLibraryKey", book.key);
  setFormValue(form, "description", description);
  clearBookLookupResults();
  setLocalStatus("bookFormStatus", "Work details loaded. Enter the edition year, publisher, and page count from your copy.", "success");
}

function clearBookLookupResults() {
  const container = document.getElementById("bookLookupResults");
  container.replaceChildren();
  container.hidden = true;
}

function createBookCover(book, imageClass, fallbackClass) {
  const imageUrl = safeHttpUrl(book.cover_url);
  if (!imageUrl) {
    return createCoverFallback(book.title, fallbackClass);
  }

  const image = createElement("img", imageClass);
  image.src = imageUrl;
  image.alt = `Cover of ${book.title}`;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    image.replaceWith(createCoverFallback(book.title, fallbackClass));
  }, { once: true });
  return image;
}

function createCoverFallback(title, className) {
  const fallback = createElement("div", className, getInitials(title));
  fallback.setAttribute("aria-hidden", "true");
  return fallback;
}

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== "") {
    element.textContent = String(text);
  }
  return element;
}

function createMessage(message) {
  return createElement("div", "empty-state", message);
}

function formControl(form, name) {
  return form.elements.namedItem(name);
}

function setFormValue(form, name, value) {
  if (value !== undefined && value !== null && value !== "") {
    formControl(form, name).value = value;
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = String(value);
  }
}

function setGlobalStatus(message, tone) {
  const status = document.getElementById("globalStatus");
  if (!status) {
    return;
  }
  status.hidden = false;
  status.textContent = message;
  status.className = `status-banner status-${tone}`;
}

function hideGlobalStatus() {
  const status = document.getElementById("globalStatus");
  if (status) {
    status.hidden = true;
    status.textContent = "";
    status.className = "status-banner";
  }
}

function setLocalStatus(id, message, tone) {
  const status = document.getElementById(id);
  if (!status) {
    return;
  }
  status.hidden = !message;
  status.textContent = message;
  status.className = message ? `inline-status status-${tone}` : "inline-status";
}

function splitList(value) {
  return [...new Set(
    String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function optionalText(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function optionalNumber(value) {
  return value === "" || value === null ? null : Number(value);
}

function normalizeIsbn(value) {
  return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function safeHttpUrl(value) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch (_error) {
    return null;
  }
}

function getInitials(value) {
  return String(value || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function formatOwnershipStatus(value) {
  return value === "wanted" ? "Want to own" : "Owned";
}

function formatReadingStatus(value) {
  const labels = {
    unread: "Unread",
    reading: "Reading",
    read: "Read",
    did_not_finish: "Did not finish"
  };
  return labels[value] || "Unread";
}