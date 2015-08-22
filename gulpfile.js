'use strict';

var _ = require('lodash'),
    del = require('del'),
    browserify = require('browserify'),
    gulp = require('gulp'),
    source = require('vinyl-source-stream'),
    buffer = require('vinyl-buffer'),
    watchify = require('watchify'),
    minifyCss = require('gulp-minify-css'),
    uglify = require('gulp-uglify'),
    size = require('gulp-size'),
    jshint = require('gulp-jshint'),
    gutil = require('gulp-util'),
    filelog = require('gulp-filelog'),
    shell = require('gulp-shell');

var jsGlob = 'src/**/*.js';
var cssGlob = 'src/**/*.css';

function bf(watch) {
    function bundle() {
        return b.bundle()
            .on('error', function(err) {
                if (watch) {
                    gutil.log(err.message);
                    this.emit('end');
                } else throw err;
            })
            .pipe(source('index.js'))
            .pipe(buffer())
            .pipe(watch ? gutil.noop() : uglify())
            .pipe(filelog('browserify'))
            .pipe(size({gzip: !watch}))
            .pipe(gulp.dest('public/js'));
    }
    var opts = {
        noParse: ['d3'],
        fullPaths: false,
        debug: watch,
    };
    if (watch) _.assign(watch, watchify.args);
    var b = browserify('src/index.js', opts);
    if (watch) {
        b = watchify(b);
        b.on('update', bundle);
    }
    return bundle();
}

gulp.task('jshint', function() {
    return gulp.src(['*.js', jsGlob])
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

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
        .pipe(filelog('mincss'))
        .pipe(gulp.dest('public/css'));
});

gulp.task('clean', function(callback) {
    del(['public'], callback);
});

gulp.task('nodemon', function() {
    return gulp.src('', {read: false})
        .pipe(shell('nodemon'));
});

gulp.task('default', ['jshint', 'browserify', 'copy', 'mincss']);
gulp.task('live', ['default', 'watch', 'watchify', 'nodemon']);
