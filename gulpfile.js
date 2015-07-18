'use strict';

var _ = require('lodash'),
    gulp = require('gulp'),
    browserify = require('browserify'),
    minifyCss = require('gulp-minify-css'),
    source = require('vinyl-source-stream'),
    del = require('del'),
    watchify = require('watchify'),
    shell = require('gulp-shell');

var cssGlob = 'src/**/*.css';

function bf(watch) {
    function bundle() {
        return b.bundle()
            .on('error', function() {}) // uglify already prints error message
            .pipe(source('index.js'))
            .pipe(gulp.dest('public/js'));
    }
    var b = browserify('src/index.js', _.assign({
        noParse: ['d3'],
        fullPaths: false,
        debug: true,
    }, watch ? watchify.args : {debug: false}));
    if (watch) {
        b = watchify(b);
        b.on('update', bundle);
    } else {
        b.plugin('minifyify', {map: false});
    }
    return bundle();
}

gulp.task('watch', ['default'], function() {
    gulp.watch(cssGlob, ['mincss']);
});

gulp.task('browserify', function() {
    return bf(false);
});

gulp.task('watchify', ['default'], function() {
    return bf(true);
});

gulp.task('copy', function() {
    return gulp.src(['node_modules/bootstrap/dist/css/bootstrap.min.css'])
        .pipe(gulp.dest('public/css'));
});

gulp.task('mincss', function() {
    return gulp.src(cssGlob)
        .pipe(minifyCss())
        .pipe(gulp.dest('public/css'));
});

gulp.task('clean', function(callback) {
    del(['public/css', 'public/js'], callback);
});

gulp.task('nodemon', function() {
    return gulp.src('', {read: false})
        .pipe(shell('nodemon'));
});

gulp.task('default', ['browserify', 'copy', 'mincss']);
gulp.task('live', ['default', 'watch', 'watchify', 'nodemon']);
