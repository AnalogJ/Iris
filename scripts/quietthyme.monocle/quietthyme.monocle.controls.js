/* SPINNER */
function controlSpinner(reader) {
  var spinner = Monocle.Controls.Spinner(reader);
  reader.addControl(spinner, 'page', { hidden: true });
  spinner.listenForUsualDelays();
}


function controlContents(reader) {
  var tocMenu = Monocle.Controls.Contents(reader);
  reader.addControl(tocMenu, 'popover', { hidden: true });

  var tocButton = {}
  tocButton.createControlElements = function () {
    var btn = document.createElement('div');
    btn.className = "tocButton";
    Monocle.Events.listen(
      btn,
      typeof Touch == "object" ? "touchstart" : "mousedown",
      function (evt) {
        if (evt.preventDefault) {
          evt.stopPropagation();
          evt.preventDefault();
        } else {
          evt.returnValue = false;
        }
        var menuDiv = reader.dom.find('controls_contents_container');
        // Really really ugly code for animation effect. Don't copy this.
        if (typeof(WebKitCSSMatrix) == "object") {
          menuDiv.style.visibility = 'hidden';
          reader.showControl(tocMenu);
          menuDiv.style.webkitTransition = "";
          menuDiv.style.webkitTransform = "translateX(-100%)";
          setTimeout(
            function () {
              menuDiv.style.visibility = 'visible';
              menuDiv.style.webkitTransition = "-webkit-transform 300ms linear";
              menuDiv.style.webkitTransform = "translateX(0px)";
            },
            10
          );
        } else {
          reader.showControl(tocMenu);
        }
      }
    );
    return btn;
  }
  reader.addControl(tocButton);
  return tocButton;
}


function controlTitle(reader) {
  var bookTitle = {}
  bookTitle.createControlElements = function () {
    var cntr = document.createElement('div');
    cntr.className = "bookTitle";
    var btText = document.createElement('span');
    btText.innerHTML = reader.getBook().getMetaData('title');
    cntr.appendChild(btText);
    this.chapText = document.createElement('span');
    btText.appendChild(this.chapText);
    this.update();
    return cntr;
  }
  bookTitle.update = function () {
    var place = reader.getPlace();
    var t = place.chapterTitle();
    if (t) {
      this.chapText.innerHTML = " &#8212; " + t;
    } else {
      this.chapText.innerHTML = "";
    }
  }

  reader.addControl(bookTitle);
  reader.listen('monocle:turn', function () { bookTitle.update() });
  return bookTitle;
}


function controlPageNumber(reader) {
  var pageNumber = {
    runners: [],
    createControlElements: function (page) {
      var cntr = document.createElement('div');
      cntr.className = "pageNumber";
      var runner = document.createElement('div');
      runner.className = "runner";
      cntr.appendChild(runner);
      this.runners.push(runner);
      this.update(page);
      return cntr;
    },
    update: function (page) {
      var place = reader.getPlace(page);
      if (place) {
        this.runners[page.m.pageIndex].innerHTML = place.pageNumber();
      }
    }
  }
  reader.addControl(pageNumber, 'page');
  reader.listen(
    'monocle:pagechange',
    function (evt) { pageNumber.update(evt.m.page) }
  );
  return pageNumber;
}