import React, { Component } from "react";
import { findDOMNode } from "react-dom";
import { autorun, observable } from "mobx";
import { observer } from "mobx-react";
import { Motion, TransitionMotion, spring } from "react-motion";

import SlideMenu from "./slide-menu";
import styles from "./index.css";

// NOTE: These must match up to the actual styles.
const slideHeight = 100;
// NOTE: These are half the value since vertical margins collapse
const slideTopMargin = 20;
const slideBottomMargin = 20;

const totalSlideHeight = slideHeight + slideTopMargin + slideBottomMargin;

const springSetting1 = { stiffness: 180, damping: 10 };
const springSetting2 = { stiffness: 1000, damping: 50 };

const getDragIndex = (topOfSlide, currentDragIndex, scrollTop, listRect) => {
  const effectiveTop = topOfSlide - listRect.top + scrollTop;
  const interSlideTop = effectiveTop % totalSlideHeight;

  let index = Math.floor(effectiveTop / totalSlideHeight);
  // Account for margins
  if (index < currentDragIndex && interSlideTop > slideTopMargin) {
    index += 1;
  } else if (index > currentDragIndex && interSlideTop <= slideTopMargin) {
    index -= 1;
  }
  return index;
};

const DropIndicator = () => <div className={styles.dropIndicator} />;

@observer
class SlideList extends Component {
  @observable isDragging = false;

  static contextTypes = {
    store: React.PropTypes.object
  };

  constructor(props, context) {
    super(props);

    this.state = {
      slideList: context.store.slides,
      mouseOffset: null,
      mouseStart: [0, 0],
      delta: [0, 0], // difference between mouse and circle pos, for dragging
      outside: false, // index of component outside
      isPressed: false
    };
  }

  componentDidMount = () => {
    // We're storing local state for drag/drop functionality
    // Update state whenever our store slides change
    // TODO: Make this animate when undo/redo/add/delete trigger it.
    autorun(() => {
      const slideList = this.context.store.slides;
      const currentSlideIndex = this.context.store.currentSlideIndex;

      this.setState({
        currentSlideIndex,
        slideList,
        updating: false
      });
    });
  }

  componentDidUpdate = () => {
    const { scrollAmount } = this.state;

    if (scrollAmount) {
      this.listWrapper.scrollTop += scrollAmount;
    }
  }


  handleMouseMove = ({ pageX, pageY }) => {
    const {
      slideList,
      mouseOffset,
      mouseStart: [x, y],
      currentDragIndex,
      originalDragIndex,
      isPressed
    } = this.state;

    const scrollTop = this.listWrapper.scrollTop;
    const listRect = this.listWrapper.getBoundingClientRect();

    if (isPressed && !this.isDragging) {
      this.isDragging = true;
    }

    const newScrollTop = this.listWrapper.scrollTop;
    const topOfSlide = pageY + mouseOffset.top;
    const bottomOfSlide = topOfSlide + slideHeight;
    const leftOfSlide = pageX + mouseOffset.left;
    const rightOfSlide = pageX + mouseOffset.right;
    const listWrapperHeight = this.listWrapper.clientHeight;
    const scrollArea = listWrapperHeight / 5 > 30 ? listWrapperHeight / 5 : 30;
    const topScroll = listRect.top + scrollArea;
    const bottomScroll = listRect.top + listWrapperHeight - scrollArea;
    const scrolled = newScrollTop - scrollTop;
    const newDelta = [pageX - x, pageY - y + scrolled];

    let scrollAmount;

    if (topOfSlide < topScroll) {
      scrollAmount = -5;
    } else if (bottomOfSlide > bottomScroll) {
      scrollAmount = 5;
    } else {
      scrollAmount = null;
    }
    // Let the slide overflow halfway for the zero index location.
    if (topOfSlide < listRect.top && topOfSlide > listRect.top - (slideHeight / 2)) {
      this.setState({
        delta: newDelta,
        currentDragIndex: 0,
        scrollAmount,
        outside: false
      });

      return;
    }

    // If we're outside of the column, setState to outside
    if (
      rightOfSlide < listRect.left ||
      leftOfSlide > listRect.right ||
      topOfSlide > listRect.bottom ||
      topOfSlide < listRect.top
    ) {
      this.setState({
        delta: newDelta,
        outside: true,
        scrollAmount,
        scrollTop,
        currentDragIndex: originalDragIndex
      });

      return;
    }

    let newIndex = getDragIndex(topOfSlide, currentDragIndex, newScrollTop, listRect);

    // Safety check
    if (newIndex > slideList.length) {
      newIndex = slideList.length - 1;
    }

    this.setState({
      delta: newDelta,
      currentDragIndex: newIndex,
      scrollTop,
      outside: false
    });
  }

  handleMouseDown = (id, index, ev) => {
    ev.preventDefault();

    const { pageX, pageY } = ev;
    const { top, right, bottom, left } = this[id].getBoundingClientRect();
    const scrollTop = this.listWrapper.scrollTop;
    this.context.store.setSelectedSlideIndex(index);
    window.addEventListener("mouseup", this.handleMouseUp);

    // Only do drag if we hold the mouse down for a bit
    this.mouseClickTimeout = setTimeout(() => {
      // TODO: Notify store and change cursor
      this.mouseClickTimeout = null;

      this.setState({
        originalDragIndex: index,
        currentDragIndex: index,
        mouseOffset: {
          top: top - pageY,
          right: right - pageX,
          bottom: bottom - pageY,
          left: left - pageX
        },
        delta: [0, 0],
        mouseStart: [pageX, pageY],
        isPressed: true,
        scrollTop
      });

      window.addEventListener("mousemove", this.handleMouseMove);
    }, 300);
  }

  handleMouseUp = () => {
    if (this.mouseClickTimeout || this.mouseClickTimeout === 0) {
      clearTimeout(this.mouseClickTimeout);
      window.removeEventListener("mouseup", this.handleMouseUp);

      this.mouseClickTimeout = null;

      return;
    }

    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);

    const { outside, originalDragIndex, currentDragIndex } = this.state;

    const state = {
      delta: [0, 0],
      outside: false,
      isPressed: false
    };

    // TODO: allow for animations to take place before updating the store
    this.setState(state, () => {
      setTimeout(() => {
        this.isDragging = false;

        this.setState({
          currentDragIndex: null,
          originalDragIndex: null,
          mouseOffset: null,
          mouseStart: [0, 0],
          delta: [0, 0], // difference between mouse and circle pos, for dragging
          outside: false, // index of component outside
          isPressed: false,
          scrollTop: null,
          updating: !outside && currentDragIndex !== originalDragIndex
        });

        if (!outside) {
          this.context.store.moveSlide(originalDragIndex, currentDragIndex);
        }
      }, 200);
    });
  }

  render() {
    const {
      currentSlideIndex,
      currentDragIndex,
      delta,
      outside,
      originalDragIndex,
      isPressed,
      updating,
      scrollTop
    } = this.state;

    return (
      <div className={styles.list}>
        <SlideMenu />
        <TransitionMotion
          willLeave={() => ({
            left: spring(-200, springSetting2),
            height: spring(0, springSetting2),
            padding: spring(0, springSetting2)
          })}
          willEnter={() => ({
            left: -200,
            height: 0,
            padding: 0
          })}
          styles={this.state.slideList.map(slide => ({
            key: `${slide.id}key`,
            style: { left: spring(0, springSetting2), height: spring(slideHeight, springSetting2), padding: spring(20, springSetting2) },
            data: slide
          }))}
        >
          {(slideListStyles) => {
            // If we're outside the column, fill in the vacant spot
            let visualIndex = 0;

            // first render: a, b, c. Second: still a, b, c! Only last one's a, b.
            return (
              <div className={styles.listWrapper} ref={(ref) => (this.listWrapper = ref)}>
                {slideListStyles.map(({ style, data, key }, i) => {
                  let motionStyle;
                  let x;
                  let y;

                  // Leave a space in this location if we're within column bounds
                  if (!outside && visualIndex === currentDragIndex) {
                    visualIndex += 1;
                  }

                  if (i === originalDragIndex) {
                    [x, y] = delta;

                    y = isPressed ? y - scrollTop : (currentDragIndex - i) * totalSlideHeight;

                    motionStyle = {
                      translateX: updating ? x + 40 : spring(x + 40, springSetting2),
                      translateY: updating ? y : spring(y, springSetting2),
                      scale: updating ? 1 : spring(isPressed ? 1.1 : 1, springSetting1),
                      zIndex: this.isDragging ? 1000 : i
                    };
                  } else {
                    y = (visualIndex - i) * totalSlideHeight;
                    visualIndex += 1;

                    motionStyle = {
                      translateX: updating ? 40 : spring(40, springSetting2),
                      translateY: updating ? y : spring(y, springSetting2),
                      scale: 1,
                      zIndex: i
                    };
                  }

                  const bgColor = currentSlideIndex === i && !this.isDragging ?
                    "#ebf5ff" : "transparent";

                  const borderStyle = currentSlideIndex === i ?
                    "1px solid #447bdc" : "1px solid transparent";

                  const position = i === originalDragIndex && isPressed ?
                    "fixed" : "relative";

                  return (
                    <div
                      key={key}
                      className={styles.slideOuter}
                      style={{
                        ...style,
                        backgroundColor: bgColor
                      }}
                    >

                    { currentDragIndex === i && <DropIndicator /> }

                    <Motion style={motionStyle}>
                      {({ translateY, translateX, scale, zIndex }) => (
                        <div
                          className={styles.slideWrapper}
                          ref={(ref) => { this[data.id] = ref; }}
                          onMouseDown={this.handleMouseDown.bind(this, data.id, i)}
                          style={{
                            zIndex,
                            border: borderStyle,
                            position,
                            transform: `
                              translate3d(${translateX}px,
                              ${translateY}px, 0)
                              scale(${scale})
                            `
                          }}
                        >
                          {
                            (originalDragIndex !== i) ?
                             <span className={styles.slideIndex}>{i + 1}</span> :
                             null
                          }
                        </div>
                      )}
                    </Motion>
                    </div>
                  );
                })}
              </div>
            );
          }}
        </TransitionMotion>

      </div>
    );
  }
}

export default SlideList;
